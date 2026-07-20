import * as assert from 'node:assert';
import * as fc from 'fast-check';
import { canonicalizeJson } from '../../src/panels/a2a/agentCardTrust';

function isWellFormedString(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return false;
      index += 1;
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      return false;
    }
  }
  return true;
}

function isWellFormedJson(value: unknown): boolean {
  if (typeof value === 'string') return isWellFormedString(value);
  if (Array.isArray(value)) return value.every((item) => isWellFormedJson(item));
  if (typeof value === 'object' && value !== null) {
    return Object.entries(value).every(
      ([key, child]) => isWellFormedString(key) && isWellFormedJson(child)
    );
  }
  return true;
}

const wellFormedJsonValue = fc.jsonValue().filter((value) => isWellFormedJson(value));

suite('Security Property Fuzzing', () => {
  test('Should preserve prototype-like JSON keys as own canonical properties', () => {
    const value = JSON.parse('{"__proto__":false,"constructor":{"prototype":true}}') as unknown;
    const canonical = canonicalizeJson(value);

    assert.strictEqual(canonical, '{"__proto__":false,"constructor":{"prototype":true}}');
    assert.deepStrictEqual(JSON.parse(canonical) as unknown, value);
  });

  test('Should deterministically canonicalize arbitrary well-formed JSON values', () => {
    fc.assert(
      fc.property(wellFormedJsonValue, (value) => {
        const canonical = canonicalizeJson(value);
        const reparsed = JSON.parse(canonical) as unknown;

        assert.strictEqual(canonicalizeJson(reparsed), canonical);
        assert.deepStrictEqual(reparsed, JSON.parse(JSON.stringify(value)) as unknown);
      }),
      { numRuns: 500, seed: 0x0b17cafe }
    );
  });

  test('Should ignore object insertion order across generated records', () => {
    const recordArbitrary = fc.dictionary(
      fc.string().filter((value) => isWellFormedString(value)),
      wellFormedJsonValue,
      { maxKeys: 24 }
    );

    fc.assert(
      fc.property(recordArbitrary, (record) => {
        const reversed = Object.fromEntries(Object.entries(record).reverse());
        assert.strictEqual(canonicalizeJson(record), canonicalizeJson(reversed));
      }),
      { numRuns: 300, seed: 0x05156f22 }
    );
  });
});
