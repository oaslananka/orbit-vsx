import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { createElectronHostEnv } from './electronHostEnv';
import { persistFailureArtifacts } from './failureArtifacts';

interface PackageManifest {
  name: string;
  version: string;
}

interface ProcessResult {
  code: number | null;
  signal: NodeJS.Signals | null;
}

const LOG_FILE_LIMIT = 12;
const LOG_TAIL_LINES = 80;
const SMOKE_TIMEOUT_MS = 180000;

function getVSCodeDownloadVersion(): string | undefined {
  const version = process.env.ORBIT_VSCODE_TEST_VERSION?.trim();
  if (!version || version.toLowerCase() === 'stable') {
    return undefined;
  }
  return version;
}
const PACKAGE_JSON_PATH = path.resolve(__dirname, '..', 'package.json');
const CLI_MODULE_PATH_PARTS = ['resources', 'app', 'out', 'cli.js'];

function readPackageManifest(): PackageManifest {
  return JSON.parse(fs.readFileSync(PACKAGE_JSON_PATH, 'utf8')) as PackageManifest;
}

function findPackagedVsix(): string {
  const manifest = readPackageManifest();
  const vsixPath = path.resolve(__dirname, '..', `${manifest.name}-${manifest.version}.vsix`);
  if (!fs.existsSync(vsixPath)) {
    throw new Error(`Packaged VSIX not found at ${vsixPath}. Run pnpm run package first.`);
  }
  return vsixPath;
}

const FORBIDDEN_PACKAGE_ENTRIES = ['extension/.semgrep.yml', 'extension/sonar-project.properties'];

function assertPackagedContents(vsixPath: string): void {
  const result = spawnSync('unzip', ['-Z1', vsixPath], {
    encoding: 'utf8',
    shell: false,
    timeout: SMOKE_TIMEOUT_MS,
  });
  writeOutput(String(result.stdout ?? ''), String(result.stderr ?? ''));
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`Unable to inspect VSIX contents with unzip: ${result.status}`);
  }

  const entries = String(result.stdout ?? '')
    .split(/\r?\n/)
    .filter(Boolean);
  const sourceMaps = entries.filter((entry) => /^extension\/dist\/.*\.map$/.test(entry));
  if (sourceMaps.length > 0) {
    throw new Error(`Packaged VSIX must not contain dist source maps: ${sourceMaps.join(', ')}`);
  }

  const forbiddenEntries = entries.filter((entry) => FORBIDDEN_PACKAGE_ENTRIES.includes(entry));
  if (forbiddenEntries.length > 0) {
    throw new Error(
      `Packaged VSIX must not contain maintainer-only files: ${forbiddenEntries.join(', ')}`
    );
  }
}

function writeOutput(stdout: string, stderr: string): void {
  if (stdout) process.stdout.write(stdout);
  if (stderr) process.stderr.write(stderr);
}

function findCliModule(vscodeExecutablePath: string): string {
  const installRoot = path.dirname(vscodeExecutablePath);
  const candidates = [
    path.join(installRoot, ...CLI_MODULE_PATH_PARTS),
    ...fs
      .readdirSync(installRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => path.join(installRoot, entry.name, ...CLI_MODULE_PATH_PARTS)),
  ];
  const cliModulePath = candidates.find((candidate) => fs.existsSync(candidate));
  if (!cliModulePath) {
    throw new Error(`VS Code CLI module not found under ${installRoot}`);
  }
  return cliModulePath;
}

function runCodeCli(vscodeExecutablePath: string, args: string[]): void {
  const cliModulePath = findCliModule(vscodeExecutablePath);
  const result = spawnSync(vscodeExecutablePath, [cliModulePath, ...args], {
    encoding: 'utf8',
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', VSCODE_DEV: '' },
    shell: false,
    timeout: SMOKE_TIMEOUT_MS,
  });
  writeOutput(String(result.stdout ?? ''), String(result.stderr ?? ''));
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`VS Code CLI ${args.join(' ')} failed with code ${result.status}`);
  }
}

function stopProcessTree(processId: number): void {
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/pid', String(processId), '/t', '/f'], { stdio: 'ignore' });
    return;
  }
  try {
    process.kill(-processId, 'SIGKILL');
  } catch {
    try {
      process.kill(processId, 'SIGKILL');
    } catch {
      // Process already exited.
    }
  }
}

async function runVSCode(executablePath: string, args: string[]): Promise<ProcessResult> {
  const child = spawn(executablePath, args, {
    detached: process.platform !== 'win32',
    env: createElectronHostEnv(process.env),
    shell: false,
  });
  child.stdout.on('data', (chunk) => process.stdout.write(chunk));
  child.stderr.on('data', (chunk) => process.stderr.write(chunk));
  return new Promise((resolve, reject) => {
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      if (child.pid) stopProcessTree(child.pid);
    }, SMOKE_TIMEOUT_MS);
    child.on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });
    child.on('close', (code, signal) => {
      clearTimeout(timeout);
      if (timedOut) {
        reject(new Error(`VS Code smoke host timed out after ${SMOKE_TIMEOUT_MS}ms`));
      } else {
        resolve({ code, signal });
      }
    });
  });
}

function collectLogFiles(root: string): string[] {
  if (!fs.existsSync(root)) return [];
  const files: string[] = [];
  const pending = [root];
  while (pending.length > 0 && files.length < LOG_FILE_LIMIT) {
    const current = pending.pop();
    if (!current) continue;
    const stat = fs.statSync(current);
    if (stat.isDirectory()) {
      fs.readdirSync(current).forEach((entry) => pending.push(path.join(current, entry)));
      continue;
    }
    if (/\.(log|txt)$/i.test(current)) files.push(current);
  }
  return files.sort();
}

function dumpLogFile(filePath: string): void {
  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
  const tail = lines.slice(-LOG_TAIL_LINES).join('\n');
  process.stderr.write(`\n--- ${filePath} ---\n${tail}\n`);
}

function dumpSmokeLogs(profileRoot: string): void {
  const logRoot = path.join(profileRoot, 'user-data', 'logs');
  const logFiles = collectLogFiles(logRoot);
  if (logFiles.length === 0) {
    process.stderr.write(`No VS Code smoke logs found under ${logRoot}\n`);
    return;
  }
  logFiles.forEach(dumpLogFile);
}

function createSmokeHarness(profileRoot: string): string {
  const harnessPath = path.join(profileRoot, 'harness');
  fs.mkdirSync(harnessPath, { recursive: true });
  fs.writeFileSync(
    path.join(harnessPath, 'package.json'),
    JSON.stringify(
      {
        name: 'orbit-package-smoke-harness',
        publisher: 'oaslananka',
        version: '0.0.0',
        engines: { vscode: '^1.100.0' },
        main: './extension.js',
      },
      null,
      2
    )
  );
  fs.writeFileSync(
    path.join(harnessPath, 'extension.js'),
    'function activate() {}\nfunction deactivate() {}\nmodule.exports = { activate, deactivate };\n'
  );
  return harnessPath;
}

function buildLaunchArgs(
  profileRoot: string,
  extensionTestsPath: string,
  harnessPath: string
): string[] {
  return [
    '--no-sandbox',
    '--disable-gpu',
    '--disable-gpu-sandbox',
    '--disable-dev-shm-usage',
    '--disable-updates',
    '--skip-welcome',
    '--skip-release-notes',
    '--disable-workspace-trust',
    '--use-inmemory-secretstorage',
    `--user-data-dir=${path.join(profileRoot, 'user-data')}`,
    `--extensions-dir=${path.join(profileRoot, 'extensions')}`,
    `--extensionDevelopmentPath=${harnessPath}`,
    `--extensionTestsPath=${extensionTestsPath}`,
  ];
}

async function main(): Promise<void> {
  let profileRoot = '';
  try {
    const { downloadAndUnzipVSCode } = await import('@vscode/test-electron');
    const executablePath = await downloadAndUnzipVSCode(getVSCodeDownloadVersion());
    const vsixPath = findPackagedVsix();
    assertPackagedContents(vsixPath);
    const extensionTestsPath = path.resolve(__dirname, './smoke/index');
    profileRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'orbit-vsix-smoke-'));
    const harnessPath = createSmokeHarness(profileRoot);
    const extensionsDir = path.join(profileRoot, 'extensions');
    const userDataDir = path.join(profileRoot, 'user-data');

    runCodeCli(executablePath, [
      `--user-data-dir=${userDataDir}`,
      `--extensions-dir=${extensionsDir}`,
      '--install-extension',
      vsixPath,
      '--force',
    ]);
    const result = await runVSCode(
      executablePath,
      buildLaunchArgs(profileRoot, extensionTestsPath, harnessPath)
    );
    if (result.code !== 0) {
      throw new Error(`Packaged smoke test failed with code ${result.code ?? result.signal}`);
    }
  } catch (err) {
    if (profileRoot) {
      dumpSmokeLogs(profileRoot);
      persistFailureArtifacts(profileRoot, 'package-smoke', err);
    }
    const errorMessage = err instanceof Error ? (err.stack ?? err.message) : String(err);
    process.stderr.write(`Failed to run packaged smoke test: ${errorMessage}\n`);
    process.exitCode = 1;
  } finally {
    if (profileRoot) {
      fs.rmSync(profileRoot, { recursive: true, force: true });
    }
  }
}

void main();
