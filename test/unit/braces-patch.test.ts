import * as assert from 'node:assert';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const braces = require('braces');

suite('braces patch: stack-exhaustion DoS fix (GHSA-vfj7-8cjw-p6xm)', () => {
  test('throws SyntaxError for deeply nested brace patterns exceeding MAX_DEPTH', () => {
    const deepPattern = '{' + '{'.repeat(100) + 'a' + '}'.repeat(100) + '}';
    assert.throws(() => braces(deepPattern), /exceeds max depth/);
  });

  test('throws SyntaxError for deeply nested parentheses exceeding MAX_DEPTH', () => {
    const deepPattern = '(' + '('.repeat(100) + 'a' + ')'.repeat(100) + ')';
    assert.throws(() => braces(deepPattern), /exceeds max depth/);
  });

  test('throws SyntaxError for deeply nested mixed patterns exceeding MAX_DEPTH', () => {
    const deepPattern = '{' + '('.repeat(100) + 'a' + ')'.repeat(100) + '}';
    assert.throws(() => braces(deepPattern), /exceeds max depth/);
  });

  test('works correctly for patterns within depth limit', () => {
    const pattern = '{a,b,{c,d},{e,{f,g}}}';
    const result = braces.expand(pattern);
    assert.deepStrictEqual(result, ['a', 'b', 'c', 'd', 'e', 'f', 'g']);
  });

  test('works correctly for patterns at depth limit boundary', () => {
    const pattern = '{' + 'a,'.repeat(50) + 'b}';
    const result = braces.expand(pattern);
    assert.strictEqual(result.length, 51);
    assert.strictEqual(result[0], 'a');
    assert.strictEqual(result[50], 'b');
  });

  test('supports custom maxDepth option', () => {
    const deepPattern = '{' + '{'.repeat(50) + 'a' + '}'.repeat(50) + '}';
    assert.throws(() => braces(deepPattern, { maxDepth: 10 }), /exceeds max depth/);
    // With higher maxDepth, parsing succeeds (expansion may not produce meaningful results for this pattern)
    assert.doesNotThrow(() => braces.parse(deepPattern, { maxDepth: 100 }));
  });

  test('expand throws SyntaxError for deeply nested patterns', () => {
    const deepPattern = '{' + '{'.repeat(100) + 'a' + '}'.repeat(100) + '}';
    assert.throws(() => braces.expand(deepPattern), /exceeds max depth/);
  });

  test('parse throws SyntaxError for deeply nested patterns before compile', () => {
    const deepPattern = '{' + '{'.repeat(100) + 'a' + '}'.repeat(100) + '}';
    assert.throws(() => braces.parse(deepPattern), /exceeds max depth/);
  });
});