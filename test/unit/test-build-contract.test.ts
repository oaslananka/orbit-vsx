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
      '.gitattributes',
      '.npmrc',
      '.pnpm-store/',
      '.pre-commit-config.yaml',
      '.prettierignore',
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
    assert.ok(manifest.scripts['smoke:package']?.startsWith('pnpm run test:compile'));
  });
});
