import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';

interface RenovatePackageRule {
  automerge?: boolean;
  enabled?: boolean;
  labels?: string[];
  matchDepTypes?: string[];
  matchManagers?: string[];
  matchPackageNames?: string[];
  matchUpdateTypes?: string[];
}

interface RenovateConfig {
  dependencyDashboard?: boolean;
  extends?: string[];
  packageRules?: RenovatePackageRule[];
  timezone?: string;
  vulnerabilityAlerts?: {
    enabled?: boolean;
    labels?: string[];
    prCreation?: string;
  };
}

interface PackageManifest {
  scripts?: Record<string, string>;
}

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const ACTION_USE_PATTERN = /^\s*- uses:\s+[^@\s]+@([a-f0-9]{40})\s+#\s+\S+/gm;
const ANY_ACTION_USE_PATTERN = /^\s*- uses:\s+(.+)$/gm;

function read(relativePath: string): string {
  return fs.readFileSync(path.join(REPO_ROOT, relativePath), 'utf8');
}

function readJson<T>(relativePath: string): T {
  return JSON.parse(read(relativePath)) as T;
}

suite('Security Tooling Contracts', () => {
  test('Should use a repository-specific Renovate best-practices policy', () => {
    const config = readJson<RenovateConfig>('renovate.json');

    assert.ok(config.extends?.includes('config:best-practices'));
    assert.strictEqual(config.timezone, 'Europe/Istanbul');
    assert.strictEqual(config.dependencyDashboard, true);
    assert.strictEqual(config.vulnerabilityAlerts?.enabled, true);
    assert.strictEqual(config.vulnerabilityAlerts?.prCreation, 'immediate');
    assert.ok(config.vulnerabilityAlerts?.labels?.includes('security'));

    const floorRule = config.packageRules?.find(
      (rule) =>
        rule.enabled === false &&
        rule.matchManagers?.includes('npm') &&
        rule.matchDepTypes?.includes('engines') &&
        rule.matchPackageNames?.includes('vscode') &&
        rule.matchPackageNames?.includes('node')
    );
    assert.ok(floorRule, 'VS Code and Node support floors must remain manual');

    const safeAutomergeRule = config.packageRules?.find(
      (rule) =>
        rule.automerge === true &&
        rule.matchUpdateTypes?.includes('patch') &&
        rule.matchUpdateTypes?.includes('digest')
    );
    assert.ok(safeAutomergeRule, 'patch and digest updates should have an explicit safe lane');

    const majorRule = config.packageRules?.find(
      (rule) => rule.automerge === false && rule.matchUpdateTypes?.includes('major')
    );
    assert.ok(majorRule, 'major updates must require manual review');
  });

  test('Should expose a strict Renovate validation command', () => {
    const manifest = readJson<PackageManifest>('package.json');
    const command = manifest.scripts?.['validate:renovate'] ?? '';

    assert.match(command, /renovate-config-validator/);
    assert.match(command, /--strict/);
    assert.match(command, /renovate@\d+\.\d+\.\d+/);
  });

  test('Should pin every GitHub Action to an immutable SHA with a version comment', () => {
    const workflows = fs
      .readdirSync(path.join(REPO_ROOT, '.github/workflows'))
      .filter((name) => name.endsWith('.yml'));

    for (const workflow of workflows) {
      const source = read(`.github/workflows/${workflow}`);
      const allUses = Array.from(source.matchAll(ANY_ACTION_USE_PATTERN));
      const pinnedUses = Array.from(source.matchAll(ACTION_USE_PATTERN));
      assert.strictEqual(
        pinnedUses.length,
        allUses.length,
        `${workflow} must pin every action and retain a Renovate-readable version comment`
      );
    }
  });

  test('Should provide tokenless Semgrep CE in CI and pre-commit', () => {
    const workflow = read('.github/workflows/semgrep.yml');
    const preCommit = read('.pre-commit-config.yaml');
    const rules = read('.semgrep.yml');

    assert.match(workflow, /semgrep==\d+\.\d+\.\d+/);
    assert.match(workflow, /semgrep scan/);
    assert.match(workflow, /--sarif/);
    assert.ok(!workflow.includes('SEMGREP_APP_TOKEN'));
    assert.match(preCommit, /semgrep==\d+\.\d+\.\d+/);
    assert.match(preCommit, /\.semgrep\.yml/);
    assert.match(rules, /rules:/);
  });

  test('Should use existing SonarCloud and Snyk apps without duplicate workflows', () => {
    const docs = read('docs/SECURITY_TOOLING.md');
    const preCommit = read('.pre-commit-config.yaml');
    const manifest = readJson<PackageManifest>('package.json');

    assert.strictEqual(
      fs.existsSync(path.join(REPO_ROOT, '.github/workflows/sonarcloud.yml')),
      false
    );
    assert.strictEqual(fs.existsSync(path.join(REPO_ROOT, '.github/workflows/snyk.yml')), false);
    assert.match(docs, /SonarCloud Code Analysis/);
    assert.match(docs, /security\/snyk \(oaslananka\)/);
    assert.match(docs, /GitHub App/i);
    assert.match(preCommit, /id: orbit-snyk/);
    assert.match(preCommit, /stages: \[manual\]/);
    assert.match(manifest.scripts?.['security:snyk'] ?? '', /snyk@\d+\.\d+\.\d+/);
  });

  test('Should document setup and local security verification', () => {
    const docs = read('docs/SECURITY_TOOLING.md');
    const contributing = read('CONTRIBUTING.md');

    assert.match(docs, /SonarCloud Code Analysis/);
    assert.match(docs, /security\/snyk \(oaslananka\)/);
    assert.match(docs, /pre-commit install/);
    assert.match(contributing, /security:semgrep/);
    assert.match(contributing, /validate:renovate/);
  });
});
