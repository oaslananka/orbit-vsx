import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';

interface PackageManifest {
  packageManager: string;
  scripts: Record<string, string>;
}

const REPO_ROOT = path.resolve(__dirname, '..', '..');

function read(relativePath: string): string {
  return fs.readFileSync(path.join(REPO_ROOT, relativePath), 'utf8');
}

suite('Compatibility Workflow Contracts', () => {
  test('Should run stable compatibility weekly and keep Insiders non-blocking', () => {
    const workflow = read('.github/workflows/compatibility.yml');

    assert.match(workflow, /schedule:/);
    assert.match(workflow, /cron:/);
    assert.match(workflow, /vscode-version: stable/);
    assert.match(workflow, /vscode-version: insiders/);
    assert.match(workflow, /experimental: true/);
    assert.match(workflow, /continue-on-error: \$\{\{ matrix\.experimental \}\}/);
    assert.match(workflow, /ORBIT_VSCODE_TEST_VERSION:/);
    assert.match(workflow, /verify:headless/);
    assert.match(workflow, /Clean headless container \/ VS Code stable/);
    assert.match(workflow, /docker build/);
    assert.match(workflow, /docker run/);
  });

  test('Should retain actionable extension-host artifacts on CI failures', () => {
    const compatibility = read('.github/workflows/compatibility.yml');
    const ci = read('.github/workflows/ci.yml');
    const testRunner = read('test/runTests.ts');
    const packageRunner = read('test/packageSmoke.ts');
    const artifactHelper = read('test/failureArtifacts.ts');

    for (const workflow of [compatibility, ci]) {
      assert.match(workflow, /actions\/upload-artifact@[a-f0-9]{40} # v\d/);
      assert.match(workflow, /\.orbit-test-artifacts/);
      assert.match(workflow, /if: failure\(\)/);
    }
    assert.match(artifactHelper, /ORBIT_TEST_ARTIFACTS_DIR/);
    assert.match(testRunner, /persistFailureArtifacts/);
    assert.match(packageRunner, /persistFailureArtifacts/);
  });

  test('Should provide a reproducible container with required Electron libraries', () => {
    const dockerfile = read('tools/headless/Dockerfile');
    const installer = read('scripts/install-headless-deps.sh');
    const operatorScript = read('scripts/check-headless-runner.mjs');

    assert.match(dockerfile, /install-orbit-headless-deps/);
    for (const dependency of ['xvfb', 'libatk1.0-0', 'libgtk-3-0', 'libnss3', 'libgbm1']) {
      assert.ok(installer.includes(dependency), `installer should include ${dependency}`);
    }
    assert.match(dockerfile, /packageManager/);
    assert.match(dockerfile, /verify:headless/);
    assert.match(read('tools/headless/verify.sh'), /docker info/);
    assert.match(read('tools/headless/verify.sh'), /--shm-size=1g/);
    assert.match(operatorScript, /xvfb-run/);
    assert.match(operatorScript, /libatk-1\.0\.so\.0/);
  });

  test('Should route all package-script pnpm calls through Corepack', () => {
    const manifest = JSON.parse(read('package.json')) as PackageManifest;
    assert.match(manifest.packageManager, /^pnpm@\d+\.\d+\.\d+$/);

    for (const [name, command] of Object.entries(manifest.scripts)) {
      const withoutCorepackPnpm = command.replaceAll('corepack pnpm', '');
      assert.doesNotMatch(
        withoutCorepackPnpm,
        /\bpnpm\b/,
        `${name} should not depend on a PATH-resolved pnpm shim`
      );
    }
    assert.match(manifest.scripts['check:headless-runner'] ?? '', /check-headless-runner\.mjs/);
    assert.match(manifest.scripts['verify:container'] ?? '', /tools\/headless\/verify\.sh/);
  });
});
