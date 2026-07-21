import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';

interface PackageManifest {
  scripts?: Record<string, string>;
}

interface RenovateCustomManager {
  description?: string;
  datasourceTemplate?: string;
  depNameTemplate?: string;
  managerFilePatterns?: string[];
  matchStrings?: string[];
}

interface RenovatePackageRule {
  automerge?: boolean;
  description?: string;
  matchPackageNames?: string[];
}

interface RenovateConfig {
  customManagers?: RenovateCustomManager[];
  packageRules?: RenovatePackageRule[];
}

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const CHECKOUT_PATTERN = /uses: actions\/checkout@[a-f0-9]{40} # v\d+\.\d+\.\d+/g;

function read(relativePath: string): string {
  return fs.readFileSync(path.join(REPO_ROOT, relativePath), 'utf8');
}

function readJson<T>(relativePath: string): T {
  return JSON.parse(read(relativePath)) as T;
}

suite('Workflow Security Contracts', () => {
  test('Should assign ownership for repository and security-sensitive surfaces', () => {
    const owners = read('.github/CODEOWNERS');

    for (const entry of [
      '* @oaslananka',
      '/.github/ @oaslananka',
      '/.pre-commit-config.yaml @oaslananka',
      '/renovate.json @oaslananka',
      '/SECURITY.md @oaslananka',
      '/RELEASING.md @oaslananka',
      '/tools/headless/ @oaslananka',
      '/scripts/run-trivy-config-scan.sh @oaslananka',
    ]) {
      assert.match(owners, new RegExp(`^${entry.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'm'));
    }
  });

  test('Should run pinned actionlint, ShellCheck, zizmor, and Trivy in one bounded workflow', () => {
    const workflow = read('.github/workflows/workflow-security.yml');

    assert.match(workflow, /^permissions:\n  contents: read$/m);
    assert.match(workflow, /name: actionlint, ShellCheck, zizmor, and Trivy/);
    assert.match(workflow, /timeout-minutes: 15/);
    assert.match(workflow, /pre-commit==4\.6\.0/);
    assert.match(workflow, /pre-commit run actionlint --all-files/);
    assert.match(workflow, /pre-commit run shellcheck --all-files/);
    assert.match(workflow, /pre-commit run zizmor --all-files/);
    assert.match(workflow, /bash scripts\/run-trivy-config-scan\.sh/);
    assert.ok(!workflow.includes('pull_request_target'));
    assert.ok(!workflow.includes('secrets.'));
  });

  test('Should pin workflow-security pre-commit hooks and keep Trivy manual locally', () => {
    const preCommit = read('.pre-commit-config.yaml');
    const manifest = readJson<PackageManifest>('package.json');

    assert.match(preCommit, /repo: https:\/\/github\.com\/rhysd\/actionlint[\s\S]*rev: v1\.7\.12/);
    assert.match(
      preCommit,
      /repo: https:\/\/github\.com\/shellcheck-py\/shellcheck-py[\s\S]*rev: v0\.11\.0\.1/
    );
    assert.match(
      preCommit,
      /repo: https:\/\/github\.com\/zizmorcore\/zizmor-pre-commit[\s\S]*rev: v1\.27\.0/
    );
    assert.match(preCommit, /--offline/);
    assert.match(preCommit, /--persona=regular/);
    assert.match(preCommit, /id: orbit-trivy-config[\s\S]*stages: \[manual\]/);
    assert.match(manifest.scripts?.['security:workflow'] ?? '', /pre-commit run actionlint/);
    assert.match(manifest.scripts?.['security:workflow'] ?? '', /pre-commit run shellcheck/);
    assert.match(manifest.scripts?.['security:workflow'] ?? '', /pre-commit run zizmor/);
    assert.strictEqual(
      manifest.scripts?.['security:trivy'],
      'bash scripts/run-trivy-config-scan.sh'
    );
  });

  test('Should disable checkout credential persistence in every workflow', () => {
    const workflows = fs
      .readdirSync(path.join(REPO_ROOT, '.github/workflows'))
      .filter((name) => name.endsWith('.yml'));

    for (const workflowName of workflows) {
      const workflow = read(`.github/workflows/${workflowName}`);
      const checkoutCount = Array.from(workflow.matchAll(CHECKOUT_PATTERN)).length;
      const hardenedCount = Array.from(
        workflow.matchAll(
          /uses: actions\/checkout@[a-f0-9]{40} # v\d+\.\d+\.\d+[\s\S]*?with:\n\s+persist-credentials: false/g
        )
      ).length;

      assert.strictEqual(
        hardenedCount,
        checkoutCount,
        `${workflowName} must disable checkout credential persistence`
      );
    }
  });

  test('Should bound every workflow job and cancel redundant validation runs', () => {
    const expectedTimeouts: Record<string, number[]> = {
      'ci.yml': [30],
      'codecov.yml': [15],
      'codeql.yml': [15],
      'compatibility.yml': [30, 35],
      'dependency-review.yml': [10],
      'release.yml': [45],
      'scorecard.yml': [15],
      'semgrep.yml': [15],
      'workflow-security.yml': [15],
    };

    for (const [workflowName, expected] of Object.entries(expectedTimeouts)) {
      const workflow = read(`.github/workflows/${workflowName}`);
      const actual = Array.from(workflow.matchAll(/timeout-minutes: (\d+)/g)).map((match) =>
        Number(match[1])
      );
      assert.deepStrictEqual(actual, expected, `${workflowName} must bound every job`);
    }

    for (const workflowName of [
      'ci.yml',
      'codecov.yml',
      'codeql.yml',
      'compatibility.yml',
      'dependency-review.yml',
      'scorecard.yml',
      'semgrep.yml',
      'workflow-security.yml',
    ]) {
      const workflow = read(`.github/workflows/${workflowName}`);
      assert.match(workflow, /^concurrency:[\s\S]*cancel-in-progress: true/m);
    }
  });

  test('Should keep release and Scorecard permissions least-privilege', () => {
    const release = read('.github/workflows/release.yml');
    const scorecard = read('.github/workflows/scorecard.yml');

    assert.match(
      release,
      /uses: actions\/setup-node@[a-f0-9]{40}[\s\S]*package-manager-cache: false/
    );
    assert.ok(!scorecard.includes('permissions: read-all'));
    assert.match(scorecard, /^permissions:\n  contents: read$/m);
    assert.match(scorecard, /scorecard:[\s\S]*actions: read/);
    assert.match(scorecard, /scorecard:[\s\S]*security-events: write/);
  });

  test('Should verify the exact Trivy release before a scoped Dockerfile scan', () => {
    const script = read('scripts/run-trivy-config-scan.sh');

    assert.match(script, /TRIVY_VERSION='0\.72\.0'/);
    assert.match(
      script,
      /TRIVY_ARCHIVE_SHA256='bbb64b9695866ce4a7a8f5c9592002c5961cab378577fa3f8a040df362b9b2ea'/
    );
    assert.match(script, /sha256sum --check --strict/);
    assert.match(script, /--proto '=https'/);
    assert.match(script, /trivy" config/);
    assert.match(script, /--severity HIGH,CRITICAL/);
    assert.match(script, /--skip-check-update/);
    assert.match(script, /tools\/headless/);
    assert.ok(!script.includes('trivy fs'));
    assert.ok(!script.includes('--scanners vuln'));
    assert.ok(!script.includes('--scanners secret'));
  });

  test('Should use an informational Codecov ratchet while the baseline matures', () => {
    const codecov = read('codecov.yml');

    assert.match(
      codecov,
      /project:[\s\S]*target: auto[\s\S]*threshold: 1%[\s\S]*informational: true/
    );
    assert.match(
      codecov,
      /patch:[\s\S]*target: auto[\s\S]*threshold: 1%[\s\S]*informational: true/
    );
    assert.match(codecov, /github_checks:[\s\S]*annotations: true/);
    assert.match(codecov, /bundle_analysis:[\s\S]*status: informational/);
  });

  test('Should let Renovate track pinned workflow tooling without unsafe automerge', () => {
    const renovate = readJson<RenovateConfig>('renovate.json');
    const managers = renovate.customManagers ?? [];
    const rules = renovate.packageRules ?? [];

    for (const description of ['Codecov CLI', 'pre-commit runner', 'Trivy release version']) {
      assert.ok(
        managers.some((manager) => manager.description?.includes(description)),
        `${description} needs a Renovate custom manager`
      );
    }

    const trivyRule = rules.find((rule) => rule.matchPackageNames?.includes('aquasecurity/trivy'));
    assert.ok(trivyRule, 'Trivy updates need a package rule');
    assert.strictEqual(trivyRule.automerge, false);
  });

  test('Should document blocking ownership and deliberate non-duplication', () => {
    const securityDocs = read('docs/SECURITY_TOOLING.md');
    const governance = read('docs/REPOSITORY_GOVERNANCE.md');

    assert.match(securityDocs, /actionlint 1\.7\.12/);
    assert.match(securityDocs, /ShellCheck 0\.11\.0/);
    assert.match(securityDocs, /zizmor 1\.27\.0/);
    assert.match(securityDocs, /Trivy 0\.72\.0/);
    assert.match(securityDocs, /Coverage, tests, and bundles/);
    assert.match(securityDocs, /actionlint, ShellCheck, zizmor, and Trivy/);
    assert.match(governance, /Squash merge is the only enabled merge method/);
    assert.match(governance, /Merge queue and Mergify/);
    assert.match(governance, /Full Trivy filesystem scanning/);
    assert.match(governance, /Additional secret scanners/);
    assert.match(governance, /markdownlint and codespell/);
  });
});
