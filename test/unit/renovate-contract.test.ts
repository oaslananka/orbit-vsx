import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';

interface PackageManifest {
  devDependencies: Record<string, string>;
  engines: {
    vscode: string;
  };
}

interface RenovatePackageRule {
  enabled?: boolean;
  matchDepTypes?: string[];
  matchManagers?: string[];
  matchPackageNames?: string[];
}

interface RenovateConfig {
  packageRules?: RenovatePackageRule[];
}

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const PACKAGE_MANIFEST_PATH = path.join(REPO_ROOT, 'package.json');
const RENOVATE_CONFIG_PATH = path.join(REPO_ROOT, 'renovate.json');
const NPM_MANAGER = 'npm';
const VSCODE_ENGINE_DEP_TYPE = 'engines';
const VSCODE_PACKAGE_NAME = 'vscode';
const SUPPORTED_VSCODE_API_FLOOR = '^1.100.0';
const VSCODE_TYPES_PACKAGE = '@types/vscode';
const VSCODE_TYPES_VERSION = '1.100.0';

function readJsonFile<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
}

suite('Renovate Contracts', () => {
  test('Should keep the VS Code API floor tied to the supported extension baseline', () => {
    const manifest = readJsonFile<PackageManifest>(PACKAGE_MANIFEST_PATH);

    assert.strictEqual(manifest.engines.vscode, SUPPORTED_VSCODE_API_FLOOR);
    assert.strictEqual(manifest.devDependencies[VSCODE_TYPES_PACKAGE], VSCODE_TYPES_VERSION);
  });

  test('Should not let Renovate raise the VS Code extension engine floor automatically', () => {
    const config = readJsonFile<RenovateConfig>(RENOVATE_CONFIG_PATH);
    const rule = (config.packageRules ?? []).find(
      (candidate) =>
        candidate.enabled === false &&
        candidate.matchManagers?.includes(NPM_MANAGER) &&
        candidate.matchDepTypes?.includes(VSCODE_ENGINE_DEP_TYPE) &&
        candidate.matchPackageNames?.includes(VSCODE_PACKAGE_NAME)
    );

    assert.ok(rule, 'Renovate should disable npm engines.vscode updates');
  });
});
