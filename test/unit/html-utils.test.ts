import * as assert from 'node:assert';
import { escapeHtml, serializeJsonForInlineScript } from '../../src/utils/escapeHtml';

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
});
