import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';

interface PackageManifest {
  scripts?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

interface C8Config {
  branches?: number;
  'check-coverage'?: boolean;
  functions?: number;
  lines?: number;
  reporter?: string[];
  statements?: number;
}

interface BundleConfig {
  bundleName?: string;
  enableBundleAnalysis?: boolean;
  gitService?: string;
  oidc?: { useGitHubOIDC?: boolean };
  telemetry?: boolean;
}

const REPO_ROOT = path.resolve(__dirname, '..', '..');

function read(relativePath: string): string {
  return fs.readFileSync(path.join(REPO_ROOT, relativePath), 'utf8');
}

function readJson<T>(relativePath: string): T {
  return JSON.parse(read(relativePath)) as T;
}

suite('Codecov Contracts', () => {
  test('Should upload exact LCOV and JUnit reports with GitHub OIDC', () => {
    const workflow = read('.github/workflows/codecov.yml');

    assert.match(workflow, /^permissions:\n  contents: read$/m);
    assert.match(workflow, /quality-observability:[\s\S]*id-token: write/);
    assert.match(
      workflow,
      /codecov\/codecov-action@fb8b3582c8e4def4969c97caa2f19720cb33a72f # v7\.0\.0/
    );
    assert.match(
      workflow,
      /codecov\/test-results-action@0fa95f0e1eeaafde2c782583b36b28ad0d8c77d3 # v1\.2\.1/
    );
    assert.match(workflow, /use_oidc: true/g);
    assert.match(workflow, /files: coverage\/lcov\.info/);
    assert.match(workflow, /files: \.test-results\/junit\.xml/);
    assert.match(workflow, /disable_search: true/g);
    assert.match(workflow, /fail_ci_if_error: true/g);
    assert.ok(!workflow.includes('CODECOV_TOKEN'));
    assert.ok(!workflow.includes('secrets.'));
  });

  test('Should preserve blocking c8 thresholds while Codecov establishes a baseline', () => {
    const c8 = readJson<C8Config>('.c8rc.json');
    const codecov = read('codecov.yml');

    assert.strictEqual(c8['check-coverage'], true);
    assert.strictEqual(c8.lines, 70);
    assert.strictEqual(c8.statements, 70);
    assert.strictEqual(c8.functions, 70);
    assert.strictEqual(c8.branches, 55);
    assert.deepStrictEqual(c8.reporter, ['text', 'lcov']);
    assert.match(codecov, /project:[\s\S]*informational: true/);
    assert.match(codecov, /patch:[\s\S]*informational: true/);
    assert.match(codecov, /bundle_analysis:[\s\S]*status: informational/);
  });

  test('Should generate deterministic reports and generic production bundle analysis', () => {
    const manifest = readJson<PackageManifest>('package.json');
    const bundle = readJson<BundleConfig>('codecov-bundle.config.json');
    const workflow = read('.github/workflows/codecov.yml');

    assert.strictEqual(manifest.devDependencies?.['@codecov/bundle-analyzer'], '2.0.1');
    assert.match(manifest.scripts?.['quality:reports'] ?? '', /output=\.test-results\/junit\.xml/);
    assert.match(manifest.scripts?.['quality:reports'] ?? '', /\.c8rc\.json/);
    assert.match(manifest.scripts?.['quality:bundle:codecov'] ?? '', /bundle-analyzer \.\/dist/);
    assert.match(workflow, /corepack pnpm run build:prod/);
    assert.match(workflow, /corepack pnpm run quality:bundle:codecov/);
    assert.strictEqual(bundle.bundleName, 'orbit-vsx-production');
    assert.strictEqual(bundle.enableBundleAnalysis, true);
    assert.strictEqual(bundle.gitService, 'github');
    assert.strictEqual(bundle.oidc?.useGitHubOIDC, true);
    assert.strictEqual(bundle.telemetry, false);
  });

  test('Should keep Codecov configs and generated reports out of the VSIX', () => {
    const gitignore = read('.gitignore');
    const vscodeignore = read('.vscodeignore');
    const packageSmoke = read('test/packageSmoke.ts');

    assert.match(gitignore, /^coverage\/$/m);
    assert.match(gitignore, /^\.test-results\/$/m);
    for (const entry of [
      'coverage/',
      '.test-results/',
      'codecov.yml',
      'codecov-bundle.config.json',
    ]) {
      assert.match(
        vscodeignore,
        new RegExp(`^${entry.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'm')
      );
    }
    assert.match(packageSmoke, /extension\/codecov\.yml/);
    assert.match(packageSmoke, /extension\/codecov-bundle\.config\.json/);
    assert.match(packageSmoke, /extension\/\.test-results\//);
  });
});
