import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { spawn } from 'node:child_process';

interface TestProcessResult {
  code: number | null;
  signal: NodeJS.Signals | null;
}

async function runVSCodeTests(executablePath: string, args: string[]): Promise<TestProcessResult> {
  const child = spawn(executablePath, args, {
    env: process.env,
    shell: false,
  });

  child.stdout.on('data', (chunk) => process.stdout.write(chunk));
  child.stderr.on('data', (chunk) => process.stderr.write(chunk));

  return new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('close', (code, signal) => resolve({ code, signal }));
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
    process.exit(1);
  } finally {
    if (profileRoot) {
      fs.rmSync(profileRoot, { recursive: true, force: true });
    }
  }
}

main();
