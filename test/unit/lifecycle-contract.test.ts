import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';

const REPO_ROOT = path.resolve(__dirname, '..', '..');

function readSource(relativePath: string): string {
  return fs.readFileSync(path.join(REPO_ROOT, relativePath), 'utf8');
}

suite('Extension Lifecycle Contracts', () => {
  test('Should dispose providers with the extension context', () => {
    const source = readSource('src/extension.ts');

    assert.match(
      source,
      /context\.subscriptions\.push\(\s*healthProvider,\s*debugProvider,\s*a2aProvider,\s*mcpProvider,/
    );
  });

  test('Should honor autoValidateOnSave without validating every edit', () => {
    const source = readSource('src/extension.ts');

    assert.ok(source.includes('vscode.workspace.onDidSaveTextDocument(validateAgentCard)'));
    assert.ok(!source.includes('vscode.workspace.onDidChangeTextDocument'));
  });

  test('Should keep health polling cancellable and non-overlapping', () => {
    const source = readSource('src/panels/health/HealthProvider.ts');

    assert.ok(source.includes('private pollingGeneration = 0'));
    assert.ok(source.includes('private refreshPromise: Promise<void> | undefined'));
    assert.ok(source.includes('generation !== this.pollingGeneration'));
    assert.ok(!source.includes('setInterval('));
  });
});
