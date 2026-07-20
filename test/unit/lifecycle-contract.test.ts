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
      /context\.subscriptions\.push\(\s*healthStore,\s*healthProvider,\s*debugProvider,\s*a2aProvider,\s*mcpProvider,/
    );
  });

  test('Should honor autoValidateOnSave without validating every edit', () => {
    const source = readSource('src/extension.ts');

    assert.ok(source.includes('vscode.workspace.onDidSaveTextDocument(validateAgentCard)'));
    assert.ok(!source.includes('vscode.workspace.onDidChangeTextDocument'));
  });

  test('Should associate VS Code debug sessions with Orbit sessions through a lifecycle tracker', () => {
    const source = readSource('src/extension.ts');

    assert.ok(source.includes('new DebugSessionTracker('));
    assert.ok(source.includes('tracker.start({ id: session.id, name: session.name })'));
    assert.ok(source.includes('tracker.terminate({ id: session.id, name: session.name })'));
    assert.ok(source.includes('await tracker?.shutdown()'));
  });

  test('Should apply the configured visible-session limit and recent window', () => {
    const providerSource = readSource('src/panels/debug/DebugProvider.ts');

    assert.ok(providerSource.includes('buildDebugSessionGroups('));
    assert.ok(providerSource.includes('config.debug.maxSessionsShown'));
    assert.ok(providerSource.includes("new DebugGroupItem('Recent (7 days)'"));
    assert.ok(providerSource.includes('return this.visibleSessionCount'));
  });

  test('Should keep health polling cancellable and non-overlapping', () => {
    const source = readSource('src/panels/health/HealthStore.ts');

    assert.ok(source.includes('private pollingGeneration = 0'));
    assert.ok(source.includes('private refreshPromise: Promise<HealthState> | undefined'));
    assert.ok(source.includes('generation !== this.pollingGeneration'));
    assert.ok(!source.includes('setInterval('));
  });

  test('Should route health consumers through the shared HealthStore', () => {
    const extensionSource = readSource('src/extension.ts');
    const statusBarSource = readSource('src/statusbar/StatusBarController.ts');
    const mcpExplorerSource = readSource('src/panels/mcp/McpExplorerProvider.ts');

    assert.ok(extensionSource.includes('const healthStore = new HealthStore()'));
    assert.ok(extensionSource.includes('new HealthProvider(context, healthStore)'));
    assert.ok(extensionSource.includes('new McpExplorerProvider(healthStore)'));
    assert.ok(!statusBarSource.includes('setInterval('));
    assert.ok(!statusBarSource.includes('getDashboard()'));
    assert.ok(!mcpExplorerSource.includes('new HealthClient('));
  });
});
