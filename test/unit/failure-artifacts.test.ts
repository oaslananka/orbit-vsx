import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { persistFailureArtifacts } from '../failureArtifacts';

suite('Failure Artifacts', () => {
  test('Should retain VS Code logs and bounded runtime metadata before profile cleanup', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'orbit-failure-artifacts-test-'));
    const profile = path.join(root, 'profile');
    const artifacts = path.join(root, 'artifacts');
    const logDirectory = path.join(profile, 'user-data', 'logs', '20260720T000000');
    fs.mkdirSync(logDirectory, { recursive: true });
    fs.writeFileSync(path.join(logDirectory, 'extension-host.log'), 'extension failed\n');
    const previousArtifacts = process.env.ORBIT_TEST_ARTIFACTS_DIR;
    const previousVersion = process.env.ORBIT_VSCODE_TEST_VERSION;

    try {
      process.env.ORBIT_TEST_ARTIFACTS_DIR = artifacts;
      process.env.ORBIT_VSCODE_TEST_VERSION = 'stable';
      const destination = persistFailureArtifacts(profile, 'extension host', new Error('boom'));

      assert.strictEqual(destination, path.join(artifacts, 'extension-host'));
      assert.strictEqual(
        fs.readFileSync(
          path.join(destination ?? '', 'logs', '20260720T000000', 'extension-host.log'),
          'utf8'
        ),
        'extension failed\n'
      );
      const metadata = JSON.parse(
        fs.readFileSync(path.join(destination ?? '', 'failure.json'), 'utf8')
      ) as { error: string; node: string; platform: string; vscodeVersion: string };
      assert.match(metadata.error, /boom/);
      assert.strictEqual(metadata.node, process.version);
      assert.match(metadata.platform, new RegExp(`^${process.platform}-`));
      assert.strictEqual(metadata.vscodeVersion, 'stable');
    } finally {
      if (previousArtifacts === undefined) delete process.env.ORBIT_TEST_ARTIFACTS_DIR;
      else process.env.ORBIT_TEST_ARTIFACTS_DIR = previousArtifacts;
      if (previousVersion === undefined) delete process.env.ORBIT_VSCODE_TEST_VERSION;
      else process.env.ORBIT_VSCODE_TEST_VERSION = previousVersion;
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
