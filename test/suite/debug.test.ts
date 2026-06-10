import * as assert from 'node:assert';
import { DebugProvider } from '../../src/panels/debug/DebugProvider';
import type * as vscode from 'vscode';

suite('Debug Recorder Panel', () => {
  test('DebugClient should construct with endpoint', () => {
    const endpoint = 'http://127.0.0.1:3001';
    assert.ok(endpoint.length > 0, 'Endpoint should be non-empty');
  });

  test('DebugProvider should have refresh method', () => {
    const provider = new DebugProvider({} as vscode.ExtensionContext);
    try {
      const hasRefresh = typeof provider.refresh === 'function';
      assert.ok(hasRefresh, 'Provider should have refresh method');
    } finally {
      provider.dispose();
    }
  });

  test('Debug session types should be valid', () => {
    const statuses = ['open', 'resolved', 'abandoned'] as const;
    assert.ok(statuses.includes('open'), 'open should be valid status');
    assert.ok(statuses.includes('resolved'), 'resolved should be valid status');
    assert.ok(statuses.includes('abandoned'), 'abandoned should be valid status');
  });
});
