import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';

interface PackageManifest {
  version: string;
}

const REPO_ROOT = path.resolve(__dirname, '..', '..');

function read(relativePath: string): string {
  return fs.readFileSync(path.join(REPO_ROOT, relativePath), 'utf8');
}

suite('Release Version Contracts', () => {
  test('Should keep package, changelog, and install documentation aligned', () => {
    const manifest = JSON.parse(read('package.json')) as PackageManifest;
    const changelog = read('CHANGELOG.md');
    const readme = read('README.md');
    const escapedVersion = manifest.version.replaceAll('.', '\\.');

    assert.match(manifest.version, /^\d+\.\d+\.\d+$/);
    assert.match(changelog, new RegExp(`## \\[${escapedVersion}\\] - \\d{4}-\\d{2}-\\d{2}`));
    assert.ok(
      changelog.indexOf('## [Unreleased]') < changelog.indexOf(`## [${manifest.version}]`),
      'Unreleased must remain above the current release entry'
    );
    assert.ok(
      readme.includes(`orbit-vsx-${manifest.version}.vsix`),
      'README install example should use the current package version'
    );
  });
});
