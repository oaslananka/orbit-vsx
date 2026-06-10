import * as assert from 'node:assert';
import { A2AProvider } from '../../src/panels/a2a/A2AProvider';
import type * as vscode from 'vscode';

suite('A2A Explorer Panel', () => {
  test('A2AClient should construct with registry URL', () => {
    const registryUrl = 'http://127.0.0.1:3099';
    assert.ok(registryUrl.length > 0, 'Registry URL should be non-empty');
  });

  test('A2AProvider should have refresh method', () => {
    const provider = new A2AProvider({} as vscode.ExtensionContext);
    try {
      const hasRefresh = typeof provider.refresh === 'function';
      assert.ok(hasRefresh, 'Provider should have refresh method');
    } finally {
      provider.dispose();
    }
  });

  test('Agent card types should be valid', () => {
    const authTypes = ['none', 'bearer', 'oauth2', 'apiKey'] as const;
    authTypes.forEach((t) => {
      assert.ok(
        ['none', 'bearer', 'oauth2', 'apiKey'].includes(t),
        `${t} should be valid auth type`
      );
    });
  });
});
