import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';

interface PackageManifest {
  scripts: Record<string, string>;
}

const REPO_ROOT = path.resolve(__dirname, '..', '..');

suite('Test Build Contracts', () => {
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
