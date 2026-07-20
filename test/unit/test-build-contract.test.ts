import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';

interface PackageManifest {
  scripts: Record<string, string>;
}

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

suite('Test Build Contracts', () => {
  test('Should keep local package manager output out of git status', () => {
    const gitignore = fs.readFileSync(path.join(REPO_ROOT, '.gitignore'), 'utf8');

    assert.match(gitignore, /^\.pnpm-store\/$/m);
  });

  test('Should keep local and maintainer-only files out of the packaged VSIX', () => {
    const vscodeignore = fs.readFileSync(path.join(REPO_ROOT, '.vscodeignore'), 'utf8');

    [
      '.commitlintrc.json',
      '.dockerignore',
      '.gitattributes',
      '.npmrc',
      '.pnpm-store/',
      '.pre-commit-config.yaml',
      '.prettierignore',
      '.orbit-test-artifacts/',
      'scripts/',
      'tools/',
      '.semgrep.yml',
      'sonar-project.properties',
      '.test-results/',
      'codecov.yml',
      'codecov-bundle.config.json',
    ].forEach((entry) => {
      assert.match(vscodeignore, new RegExp(`^${escapeRegExp(entry)}$`, 'm'));
    });
  });

  test('Should compile tests from a clean generated-output state', () => {
    const manifest = JSON.parse(
      fs.readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf8')
    ) as PackageManifest;

    assert.strictEqual(
      manifest.scripts['test:compile'],
      'node test/cleanGenerated.mjs && tsc -p test/tsconfig.json'
    );
    assert.ok(manifest.scripts.pretest?.includes('pnpm run test:compile'));
    assert.ok(manifest.scripts['pretest:unit']?.includes('pnpm run test:compile'));
    assert.ok(manifest.scripts['smoke:package']?.startsWith('corepack pnpm run test:compile'));
  });

  test('Should kill the full VS Code test process group on host timeout', () => {
    const source = fs.readFileSync(path.join(REPO_ROOT, 'test/runTests.ts'), 'utf8');

    assert.ok(source.includes("detached: process.platform !== 'win32'"));
    assert.ok(source.includes("process.kill(-processId, 'SIGKILL')"));
    assert.ok(source.includes('TEST_HOST_TIMEOUT_MS'));
    assert.ok(source.includes('VS Code test host timed out'));
  });

  test('Should keep package smoke host timeout cleanup aligned with extension tests', () => {
    const source = fs.readFileSync(path.join(REPO_ROOT, 'test/packageSmoke.ts'), 'utf8');

    assert.ok(source.includes("detached: process.platform !== 'win32'"));
    assert.ok(source.includes("process.kill(-processId, 'SIGKILL')"));
    assert.ok(source.includes("'--disable-gpu'"));
    assert.ok(source.includes("'--disable-dev-shm-usage'"));
    assert.ok(source.includes('SMOKE_TIMEOUT_MS'));
    assert.ok(source.includes('VS Code smoke host timed out'));
  });
});
