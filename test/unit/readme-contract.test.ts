import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';

interface PackageManifest {
  displayName: string;
  publisher: string;
  version: string;
}

const REPO_ROOT = path.resolve(__dirname, '..', '..');

function read(relativePath: string): string {
  return fs.readFileSync(path.join(REPO_ROOT, relativePath), 'utf8');
}

suite('README Contracts', () => {
  const readme = read('README.md');
  const manifest = JSON.parse(read('package.json')) as PackageManifest;

  test('Should present a centered product landing page', () => {
    assert.match(readme, /^<div align="center">/);
    assert.match(readme, /# Orbit MCP & A2A/);
    assert.match(
      readme,
      /MCP health, debug session intelligence, and A2A trust workflows for VS Code/
    );
    assert.match(readme, /This repository owns the VS Code extension surface/);
  });

  test('Should expose live repository and distribution badges', () => {
    for (const expected of [
      'actions/workflows/ci.yml/badge.svg',
      'actions/workflows/codeql.yml/badge.svg',
      'actions/workflows/semgrep.yml/badge.svg',
      'codecov.io/gh/oaslananka/orbit-vsx/branch/main/graph/badge.svg',
      'api.scorecard.dev/projects/github.com/oaslananka/orbit-vsx/badge',
      'open-vsx.org/extension/oaslananka/orbit-vsx',
      'marketplace.visualstudio.com/items?itemName=oaslananka.orbit-vsx',
      'github.com/oaslananka/orbit-vsx/releases/latest',
      'license-Apache--2.0',
    ]) {
      assert.ok(readme.includes(expected), `README should contain ${expected}`);
    }
  });

  test('Should keep install examples aligned with package metadata', () => {
    assert.strictEqual(manifest.displayName, 'Orbit MCP & A2A');
    assert.strictEqual(manifest.publisher, 'oaslananka');
    assert.match(readme, new RegExp(`orbit-vsx-${manifest.version.replaceAll('.', '\\.')}\\.vsix`));
    assert.match(readme, /oaslananka\.orbit-vsx/);
  });

  test('Should link core user and maintainer resources', () => {
    for (const expected of [
      'docs/REPOSITORY_GOVERNANCE.md',
      'docs/MAINTAINER_ROADMAP.md',
      'docs/SECURITY_MODEL.md',
      'SECURITY.md',
      'CONTRIBUTING.md',
      'CHANGELOG.md',
      'github.com/oaslananka/orbit-vsx/discussions',
    ]) {
      assert.ok(readme.includes(expected), `README should link ${expected}`);
    }
  });

  test('Should state companion-service boundaries without unsupported badges', () => {
    assert.match(readme, /Orbit does not start or bundle its companion services/);
    assert.match(readme, /health-monitor-mcp/);
    assert.match(readme, /debug-recorder-mcp/);
    assert.match(readme, /a2a-warp/);
    assert.ok(!readme.includes('bestpractices.dev'));
    assert.ok(!readme.includes('docs-site'));
  });
});
