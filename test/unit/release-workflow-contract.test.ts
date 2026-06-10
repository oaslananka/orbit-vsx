import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const RELEASE_WORKFLOW_PATH = path.join(REPO_ROOT, '.github', 'workflows', 'release.yml');

suite('Release Workflow Contracts', () => {
  test('Should publish only verified tags from main', () => {
    const workflow = fs.readFileSync(RELEASE_WORKFLOW_PATH, 'utf8');

    assert.match(workflow, /fetch-depth:\s*0/);
    assert.ok(workflow.includes('git merge-base --is-ancestor "$GITHUB_SHA" origin/main'));
    assert.ok(workflow.includes('tag_version="${GITHUB_REF_NAME#v}"'));
    assert.ok(workflow.includes('xvfb-run -a pnpm run verify'));
    assert.ok(workflow.includes('pnpm audit --audit-level moderate'));

    const verifyIndex = workflow.indexOf('xvfb-run -a pnpm run verify');
    const marketplaceIndex = workflow.indexOf('Publish to VS Code Marketplace');
    const openVsxIndex = workflow.indexOf('Publish to OpenVSX');
    assert.ok(verifyIndex >= 0 && verifyIndex < marketplaceIndex);
    assert.ok(marketplaceIndex < openVsxIndex);
  });

  test('Should make registry and GitHub release publishing restartable', () => {
    const workflow = fs.readFileSync(RELEASE_WORKFLOW_PATH, 'utf8');

    assert.match(workflow, /vsce publish .*--skip-duplicate .*--packagePath \.\/\*\.vsix/);
    assert.match(workflow, /ovsx publish .*--skip-duplicate .*--packagePath \.\/\*\.vsix/);
    assert.ok(workflow.includes('gh release view "$GITHUB_REF_NAME"'));
    assert.ok(workflow.includes('gh release upload "$GITHUB_REF_NAME"'));
    assert.ok(workflow.includes('--clobber'));
  });
});
