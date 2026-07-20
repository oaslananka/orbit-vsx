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
    assert.ok(source.includes('context.subscriptions.push({ dispose: disposeAuditChannel })'));
  });

  test('Should honor autoValidateOnSave without validating every edit', () => {
    const source = readSource('src/extension.ts');

    assert.ok(source.includes('vscode.workspace.onDidSaveTextDocument(validateAgentCard)'));
    assert.ok(!source.includes('vscode.workspace.onDidChangeTextDocument'));
  });

  test('Should reconcile optional debug integrations without extension reloads', () => {
    const source = readSource('src/extension.ts');

    assert.ok(source.includes('new DebugIntegrationController({'));
    assert.ok(source.includes('new DebugSessionTracker('));
    assert.ok(source.includes('debugIntegrations.reconcile(config.debug)'));
    assert.ok(source.includes('debugIntegrations.reconcile(nextConfig.debug)'));
    assert.ok(source.includes('debugIntegrations.onDebugClientChanged()'));
    assert.ok(source.includes('await controller?.shutdown()'));
    assert.ok(!source.includes('if (config.debug.showEditorDecorations)'));
    assert.ok(!source.includes('if (config.debug.autoTrackVscodeSessions)'));
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
    const providerSource = readSource('src/panels/health/HealthProvider.ts');
    assert.ok(providerSource.includes('async refreshDashboard(): Promise<DashboardData>'));
    assert.ok(providerSource.includes('return (await this.store.refresh()).dashboard'));
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
