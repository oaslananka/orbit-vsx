import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { spawn } from 'node:child_process';
import { createElectronHostEnv } from './electronHostEnv';

interface TestProcessResult {
  code: number | null;
  signal: NodeJS.Signals | null;
}

const TEST_HOST_TIMEOUT_MS = 180000;

function stopProcessTree(processId: number): void {
  if (process.platform === 'win32') {
    spawn('taskkill', ['/pid', String(processId), '/t', '/f'], {
      shell: false,
      stdio: 'ignore',
    });
    return;
  }
  try {
    process.kill(processId, 'SIGKILL');
  } catch {
    // Process already exited.
  }
}

async function runVSCodeTests(executablePath: string, args: string[]): Promise<TestProcessResult> {
  const child = spawn(executablePath, args, {
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
    }, TEST_HOST_TIMEOUT_MS);
    child.on('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.on('close', (code, signal) => {
      clearTimeout(timeout);
      if (timedOut) {
        reject(new Error(`VS Code test host timed out after ${TEST_HOST_TIMEOUT_MS}ms`));
      } else {
        resolve({ code, signal });
      }
    });
  });
}

async function main(): Promise<void> {
  let profileRoot = '';
  try {
    const { downloadAndUnzipVSCode } = await import('@vscode/test-electron');

    const extensionDevelopmentPath = path.resolve(__dirname, '..');
    const extensionTestsPath = path.resolve(__dirname, './suite/index');
    const executablePath = await downloadAndUnzipVSCode();
    profileRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'orbit-vscode-test-'));

    const args = [
      '--disable-extensions',
      '--no-sandbox',
      '--disable-gpu-sandbox',
      '--disable-updates',
      '--skip-welcome',
      '--skip-release-notes',
      '--disable-workspace-trust',
      `--user-data-dir=${path.join(profileRoot, 'user-data')}`,
      `--extensions-dir=${path.join(profileRoot, 'extensions')}`,
      `--extensionDevelopmentPath=${extensionDevelopmentPath}`,
      `--extensionTestsPath=${extensionTestsPath}`,
    ];

    const result = await runVSCodeTests(executablePath, args);
    if (result.code !== 0) {
      throw new Error(`Test run failed with code ${result.code ?? result.signal}`);
    }
  } catch (err) {
    process.stderr.write(
      `Failed to run tests: ${err instanceof Error ? err.message : String(err)}\n`
    );
    process.exitCode = 1;
  } finally {
    if (profileRoot) {
      fs.rmSync(profileRoot, { recursive: true, force: true });
    }
  }
}

void main();
