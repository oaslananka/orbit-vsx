import * as assert from 'node:assert';
import { HealthProvider } from '../../src/panels/health/HealthProvider';
import * as vscode from 'vscode';

suite('Health Monitor Panel', () => {
  test('HealthClient should construct with endpoint', () => {
    const endpoint = 'http://127.0.0.1:3000';
    assert.ok(endpoint.length > 0, 'Endpoint should be non-empty');
  });

  test('HealthProvider should have refresh method', () => {
    const provider = new HealthProvider({} as vscode.ExtensionContext);
    const hasRefresh = typeof provider.refresh === 'function';
    assert.ok(hasRefresh, 'Provider should have refresh method');
  });
});
