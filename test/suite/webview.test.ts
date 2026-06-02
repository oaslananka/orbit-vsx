import * as assert from 'node:assert';

import { getNonce } from '../../src/utils/webview';

const NONCE_LENGTH = 64;
const NONCE_PATTERN = /^[A-Za-z0-9]+$/;
const UNIQUENESS_SAMPLE_SIZE = 8;

suite('Webview Utilities', () => {
  test('getNonce returns an alphanumeric 64-character nonce', () => {
    const nonce = getNonce();

    assert.strictEqual(nonce.length, NONCE_LENGTH);
    assert.match(nonce, NONCE_PATTERN);
  });

  test('getNonce produces distinct values across repeated calls', () => {
    const nonces = new Set(Array.from({ length: UNIQUENESS_SAMPLE_SIZE }, () => getNonce()));

    assert.ok(
      nonces.size > 1,
      'Expected getNonce to produce distinct values across repeated calls.'
    );
  });
});
