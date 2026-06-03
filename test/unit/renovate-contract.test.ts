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
  matchDepTypes?: unknown;
  matchManagers?: unknown;
  matchPackageNames?: unknown;
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

function stringArrayIncludes(value: unknown, expected: string): boolean {
  return Array.isArray(value) && value.includes(expected);
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
        stringArrayIncludes(candidate.matchManagers, NPM_MANAGER) &&
        stringArrayIncludes(candidate.matchDepTypes, VSCODE_ENGINE_DEP_TYPE) &&
        stringArrayIncludes(candidate.matchPackageNames, VSCODE_PACKAGE_NAME)
    );

    assert.ok(rule, 'Renovate should disable npm engines.vscode updates');
  });
});
