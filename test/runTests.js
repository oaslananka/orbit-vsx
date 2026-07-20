"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const node_child_process_1 = require("node:child_process");
const electronHostEnv_1 = require("./electronHostEnv");
const failureArtifacts_1 = require("./failureArtifacts");
const TEST_HOST_TIMEOUT_MS = 180000;
function getVSCodeDownloadVersion() {
    const version = process.env.ORBIT_VSCODE_TEST_VERSION?.trim();
    if (!version || version.toLowerCase() === 'stable') {
        return undefined;
    }
    return version;
}
function stopProcessTree(processId) {
    if (process.platform === 'win32') {
        (0, node_child_process_1.spawn)('taskkill', ['/pid', String(processId), '/t', '/f'], {
            shell: false,
            stdio: 'ignore',
        });
        return;
    }
    try {
        process.kill(-processId, 'SIGKILL');
    }
    catch {
        try {
            process.kill(processId, 'SIGKILL');
        }
        catch {
            // Process already exited.
        }
    }
}
async function runVSCodeTests(executablePath, args) {
    const child = (0, node_child_process_1.spawn)(executablePath, args, {
        detached: process.platform !== 'win32',
        env: (0, electronHostEnv_1.createElectronHostEnv)(process.env),
        shell: false,
    });
    child.stdout.on('data', (chunk) => process.stdout.write(chunk));
    child.stderr.on('data', (chunk) => process.stderr.write(chunk));
    return new Promise((resolve, reject) => {
        let timedOut = false;
        const timeout = setTimeout(() => {
            timedOut = true;
            if (child.pid)
                stopProcessTree(child.pid);
        }, TEST_HOST_TIMEOUT_MS);
        child.on('error', (error) => {
            clearTimeout(timeout);
            reject(error);
        });
        child.on('close', (code, signal) => {
            clearTimeout(timeout);
            if (timedOut) {
                reject(new Error(`VS Code test host timed out after ${TEST_HOST_TIMEOUT_MS}ms`));
            }
            else {
                resolve({ code, signal });
            }
        });
    });
}
async function main() {
    let profileRoot = '';
    try {
        const { downloadAndUnzipVSCode } = await Promise.resolve().then(() => require('@vscode/test-electron'));
        const extensionDevelopmentPath = path.resolve(__dirname, '..');
        const extensionTestsPath = path.resolve(__dirname, './suite/index');
        const executablePath = await downloadAndUnzipVSCode(getVSCodeDownloadVersion());
        profileRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'orbit-vscode-test-'));
        const args = [
            '--disable-extensions',
            '--no-sandbox',
            '--disable-gpu-sandbox',
            '--disable-updates',
            '--skip-welcome',
            '--skip-release-notes',
            '--disable-workspace-trust',
            '--use-inmemory-secretstorage',
            `--user-data-dir=${path.join(profileRoot, 'user-data')}`,
            `--extensions-dir=${path.join(profileRoot, 'extensions')}`,
            `--extensionDevelopmentPath=${extensionDevelopmentPath}`,
            `--extensionTestsPath=${extensionTestsPath}`,
        ];
        const result = await runVSCodeTests(executablePath, args);
        if (result.code !== 0) {
            throw new Error(`Test run failed with code ${result.code ?? result.signal}`);
        }
    }
    catch (err) {
        if (profileRoot)
            (0, failureArtifacts_1.persistFailureArtifacts)(profileRoot, 'extension-host', err);
        process.stderr.write(`Failed to run tests: ${err instanceof Error ? err.message : String(err)}\n`);
        process.exitCode = 1;
    }
    finally {
        if (profileRoot) {
            fs.rmSync(profileRoot, { recursive: true, force: true });
        }
    }
}
void main();
