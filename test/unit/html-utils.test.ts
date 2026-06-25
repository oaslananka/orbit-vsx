import * as assert from 'node:assert';
import { escapeHtml, serializeJsonForInlineScript } from '../../src/utils/escapeHtml';
import { renderOrbitWebviewHtml } from '../../src/utils/webview';

suite('HTML Utilities', () => {
  test('Should escape HTML special characters', () => {
    assert.strictEqual(
      escapeHtml('<button title="a&b">'),
      '&lt;button title=&quot;a&amp;b&quot;&gt;'
    );
  });

  test('Should keep serialized JSON inside its inline script element', () => {
    const serialized = serializeJsonForInlineScript({
      value: '</script><script>bad()</script>&\u2028\u2029',
    });

    assert.ok(!serialized.includes('</script>'));
    assert.ok(!serialized.includes('<script>'));
    assert.ok(!serialized.includes('&'));
    assert.ok(serialized.includes('\\u003c/script\\u003e'));
    assert.ok(serialized.includes('\\u2028\\u2029'));
    assert.deepStrictEqual(JSON.parse(serialized), {
      value: '</script><script>bad()</script>&\u2028\u2029',
    });
  });

  test('Should render the shared Orbit webview shell with strict CSP and optional data', () => {
    const html = renderOrbitWebviewHtml({
      title: '<Orbit>',
      webview: { cspSource: 'vscode-resource:' } as never,
      scriptUri: { toString: () => 'vscode-resource:/panel/index.js' } as never,
      nonce: 'nonce-123',
      initialData: { value: '<\/script>' },
    });

    assert.ok(html.includes('<title>&lt;Orbit&gt;</title>'));
    assert.ok(html.includes("default-src 'none'"));
    assert.ok(html.includes('img-src vscode-resource: https:'));
    assert.ok(html.includes('font-src vscode-resource:'));
    assert.ok(html.includes("style-src vscode-resource: 'unsafe-inline'"));
    assert.ok(html.includes("script-src 'nonce-nonce-123'"));
    assert.ok(html.includes('data-orbit-webview-root="true"'));
    assert.ok(html.includes('window.__ORBIT_DATA__'));
    assert.ok(!html.includes('</script><script>'));
  });
});
