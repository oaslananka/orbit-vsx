import * as assert from 'node:assert';
import { generateKeyPairSync, sign } from 'node:crypto';
import {
  AgentCardTrustVerifier,
  canonicalizeAgentCardPayload,
  canonicalizeJson,
  type AgentCardTrustResult,
} from '../../src/panels/a2a/agentCardTrust';

type JsonRecord = Record<string, unknown>;

const CARD_URL = 'https://agent.example/.well-known/agent-card.json';
const JWKS_URL = 'https://agent.example/.well-known/jwks.json';

function base64UrlJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
}

function unsignedAgentCard(): JsonRecord {
  return {
    capabilities: { pushNotifications: false, streaming: true },
    defaultInputModes: ['application/json'],
    defaultOutputModes: ['application/json'],
    description: 'Answers support questions',
    name: 'support-agent',
    skills: [
      {
        description: 'Answer questions',
        id: 'answer_questions',
        name: 'Answer Questions',
        tags: ['support', 'qa'],
      },
    ],
    supportedInterfaces: [
      {
        protocolBinding: 'jsonrpc',
        protocolVersion: '1.0',
        url: 'https://agent.example/a2a',
      },
    ],
    version: '1.0.0',
  };
}

function createEs256Fixture(
  options: {
    algorithm?: string;
    jku?: string;
    keyOverrides?: JsonRecord;
    protectedOverrides?: JsonRecord;
  } = {}
): { card: JsonRecord; jwks: JsonRecord; keyId: string } {
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const keyId = 'agent-signing-key-1';
  const algorithm = options.algorithm ?? 'ES256';
  const protectedHeader = {
    alg: algorithm,
    jku: options.jku ?? JWKS_URL,
    kid: keyId,
    typ: 'JOSE',
    ...options.protectedOverrides,
  };
  const protectedValue = base64UrlJson(protectedHeader);
  const payload = unsignedAgentCard();

  // This fixture deliberately signs an independently ordered JSON representation.
  // The verifier must produce the same RFC 8785 representation to validate it.
  const independentlyCanonicalPayload = JSON.stringify(payload);
  const signingInput = `${protectedValue}.${Buffer.from(
    independentlyCanonicalPayload,
    'utf8'
  ).toString('base64url')}`;
  const signature = sign('sha256', Buffer.from(signingInput, 'ascii'), {
    key: privateKey,
    dsaEncoding: 'ieee-p1363',
  }).toString('base64url');
  const publicJwk = publicKey.export({ format: 'jwk' }) as JsonRecord;

  return {
    card: {
      ...payload,
      signatures: [{ protected: protectedValue, signature }],
    },
    jwks: {
      keys: [
        {
          ...publicJwk,
          alg: 'ES256',
          kid: keyId,
          key_ops: ['verify'],
          use: 'sig',
          ...options.keyOverrides,
        },
      ],
    },
    keyId,
  };
}

function createRs256Fixture(): { card: JsonRecord; jwks: JsonRecord; keyId: string } {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const keyId = 'agent-rsa-key-1';
  const protectedValue = base64UrlJson({
    alg: 'RS256',
    jku: JWKS_URL,
    kid: keyId,
    typ: 'JOSE',
  });
  const payload = unsignedAgentCard();
  const signingInput = `${protectedValue}.${Buffer.from(JSON.stringify(payload), 'utf8').toString(
    'base64url'
  )}`;
  const signature = sign('RSA-SHA256', Buffer.from(signingInput, 'ascii'), privateKey).toString(
    'base64url'
  );
  const publicJwk = publicKey.export({ format: 'jwk' }) as JsonRecord;
  return {
    card: { ...payload, signatures: [{ protected: protectedValue, signature }] },
    jwks: {
      keys: [{ ...publicJwk, alg: 'RS256', kid: keyId, key_ops: ['verify'], use: 'sig' }],
    },
    keyId,
  };
}

function assertState(result: AgentCardTrustResult, state: AgentCardTrustResult['state']): void {
  assert.strictEqual(result.state, state, result.summary);
}

suite('Agent Card Trust Verification', () => {
  test('Should implement the RFC 8785 canonicalization example', () => {
    const sample = JSON.parse(
      '{"numbers":[333333333.33333329,1E30,4.50,2e-3,0.000000000000000000000000001],"string":"€$\\u000f\\nA\'B\\"\\\\\\\\\\"/","literals":[null,true,false]}'
    ) as unknown;

    assert.strictEqual(
      canonicalizeJson(sample),
      '{"literals":[null,true,false],"numbers":[333333333.3333333,1e+30,4.5,0.002,1e-27],"string":"€$\\u000f\\nA\'B\\"\\\\\\\\\\"/"}'
    );
    assert.throws(() => canonicalizeJson('\ud800'), /Unicode|surrogate/i);
    assert.throws(() => canonicalizeJson(Number.POSITIVE_INFINITY), /finite|JSON number/i);
  });

  test('Should sort canonical object keys by UTF-16 code units rather than locale collation', () => {
    assert.strictEqual(
      canonicalizeJson({ z: 1, ä: 2, a: 3, '😀': 4 }),
      '{"a":3,"z":1,"ä":2,"😀":4}'
    );
  });

  test('Should exclude signatures and optional empty collections from the signing payload', () => {
    const payload = {
      ...unsignedAgentCard(),
      capabilities: { extensions: [], streaming: true },
      signatures: [{ protected: 'ignored', signature: 'ignored' }],
      securityRequirements: [],
      skills: [
        {
          description: 'Answer questions',
          examples: [],
          id: 'answer_questions',
          name: 'Answer Questions',
          tags: ['support'],
        },
      ],
    };
    const canonical = canonicalizeAgentCardPayload(payload);

    assert.ok(!canonical.includes('signatures'));
    assert.ok(!canonical.includes('securityRequirements'));
    assert.ok(!canonical.includes('examples'));
    assert.ok(!canonical.includes('extensions'));
    assert.ok(canonical.includes('"streaming":true'));
  });

  test('Should verify a normative ES256 Agent Card signature', async () => {
    const fixture = createEs256Fixture();
    const verifier = new AgentCardTrustVerifier({
      jwksFetcher: async (url) => {
        assert.strictEqual(url, JWKS_URL);
        return fixture.jwks;
      },
    });

    const trust = await verifier.verify(fixture.card, { sourceUrl: CARD_URL });

    assertState(trust, 'verified');
    assert.strictEqual(trust.algorithm, 'ES256');
    assert.strictEqual(trust.keyId, fixture.keyId);
    assert.strictEqual(trust.keyUrl, JWKS_URL);
    assert.strictEqual(trust.verifiedSignatureIndex, 0);
    const fixtureSignature = (fixture.card.signatures as Array<{ signature: string }>)[0]
      ?.signature;
    assert.ok(fixtureSignature);
    assert.ok(!Object.hasOwn(trust, 'protected'));
    assert.ok(!Object.hasOwn(trust, 'signature'));
    assert.ok(!JSON.stringify(trust).includes(fixtureSignature));
  });

  test('Should verify RS256 and require typ JOSE in the protected header', async () => {
    const rsa = createRs256Fixture();
    const verifier = new AgentCardTrustVerifier({ jwksFetcher: async () => rsa.jwks });
    const verified = await verifier.verify(rsa.card, { sourceUrl: CARD_URL });
    assertState(verified, 'verified');
    assert.strictEqual(verified.algorithm, 'RS256');

    const missingTyp = createEs256Fixture({ protectedOverrides: { typ: undefined } });
    const missingTypTrust = await new AgentCardTrustVerifier({
      jwksFetcher: async () => missingTyp.jwks,
    }).verify(missingTyp.card, { sourceUrl: CARD_URL });
    assertState(missingTypTrust, 'invalid');
    assert.strictEqual(missingTypTrust.reason, 'missing_protected_header');
  });

  test('Should reject duplicate or unprotected security header parameters', async () => {
    const fixture = createEs256Fixture();
    const signature = (
      fixture.card.signatures as Array<{
        header?: JsonRecord;
        protected: string;
        signature: string;
      }>
    )[0];
    assert.ok(signature);

    const duplicateProtected = Buffer.from(
      `{"alg":"ES256","alg":"RS256","typ":"JOSE","kid":"${fixture.keyId}","jku":"${JWKS_URL}"}`,
      'utf8'
    ).toString('base64url');
    const duplicateCard = {
      ...fixture.card,
      signatures: [{ ...signature, protected: duplicateProtected }],
    };
    const unprotectedCard = {
      ...fixture.card,
      signatures: [{ ...signature, header: { kid: fixture.keyId } }],
    };
    const verifier = new AgentCardTrustVerifier({ jwksFetcher: async () => fixture.jwks });

    const duplicateTrust = await verifier.verify(duplicateCard, { sourceUrl: CARD_URL });
    const unprotectedTrust = await verifier.verify(unprotectedCard, { sourceUrl: CARD_URL });

    assertState(duplicateTrust, 'invalid');
    assert.strictEqual(duplicateTrust.reason, 'malformed_protected_header');
    assertState(unprotectedTrust, 'invalid');
    assert.strictEqual(unprotectedTrust.reason, 'header_conflict');
  });

  test('Should redact JWKS query values in the public trust result', async () => {
    const secretJwksUrl = `${JWKS_URL}?token=secret`;
    const fixture = createEs256Fixture({ jku: secretJwksUrl });
    const verifier = new AgentCardTrustVerifier({
      jwksFetcher: async () => fixture.jwks,
      trustedJwksUrls: [secretJwksUrl],
    });

    const trust = await verifier.verify(fixture.card);

    assertState(trust, 'verified');
    assert.ok(trust.keyUrl?.includes('%E2%80%A6'));
    assert.ok(!trust.keyUrl?.includes('secret'));
  });

  test('Should detect a modified signed payload', async () => {
    const fixture = createEs256Fixture();
    const verifier = new AgentCardTrustVerifier({ jwksFetcher: async () => fixture.jwks });
    const modified = { ...fixture.card, description: 'Tampered description' };

    const trust = await verifier.verify(modified, { sourceUrl: CARD_URL });

    assertState(trust, 'invalid');
    assert.strictEqual(trust.reason, 'invalid_signature');
  });

  test('Should report invalid when any usable matching key rejects the signature', async () => {
    const fixture = createEs256Fixture();
    const usableKey = (fixture.jwks.keys as JsonRecord[])[0];
    assert.ok(usableKey);
    const verifier = new AgentCardTrustVerifier({
      jwksFetcher: async () => ({
        keys: [{ ...usableKey, exp: 1 }, usableKey],
      }),
      now: () => 1_800_000_000_000,
    });
    const modified = { ...fixture.card, description: 'Tampered description' };

    const trust = await verifier.verify(modified, { sourceUrl: CARD_URL });

    assertState(trust, 'invalid');
    assert.strictEqual(trust.reason, 'invalid_signature');
  });

  test('Should report unsigned cards independently from schema validity', async () => {
    const verifier = new AgentCardTrustVerifier({ jwksFetcher: async () => ({ keys: [] }) });

    const trust = await verifier.verify(unsignedAgentCard(), { sourceUrl: CARD_URL });

    assertState(trust, 'unsigned');
    assert.strictEqual(trust.signatureCount, 0);
    assert.strictEqual(trust.reason, 'no_signatures');
  });

  test('Should reject unsafe algorithms and identify unsupported algorithms', async () => {
    const unsafe = createEs256Fixture({ algorithm: 'none' });
    const unsupported = createEs256Fixture({ algorithm: 'PS256' });
    const verifier = new AgentCardTrustVerifier({ jwksFetcher: async () => unsafe.jwks });

    const unsafeTrust = await verifier.verify(unsafe.card, { sourceUrl: CARD_URL });
    const unsupportedTrust = await verifier.verify(unsupported.card, { sourceUrl: CARD_URL });

    assertState(unsafeTrust, 'invalid');
    assert.strictEqual(unsafeTrust.reason, 'unsafe_algorithm');
    assertState(unsupportedTrust, 'unverified');
    assert.strictEqual(unsupportedTrust.reason, 'unsupported_algorithm');
  });

  test('Should distinguish unavailable, expired, and revoked keys', async () => {
    const fixture = createEs256Fixture();
    const unavailable = new AgentCardTrustVerifier({
      jwksFetcher: async () => {
        throw new Error('network unavailable');
      },
    });
    const expired = new AgentCardTrustVerifier({
      jwksFetcher: async () => ({
        keys: [
          {
            ...(fixture.jwks.keys as JsonRecord[])[0],
            exp: 1_700_000_000,
          },
        ],
      }),
      now: () => 1_800_000_000_000,
    });
    const revoked = new AgentCardTrustVerifier({
      jwksFetcher: async () => ({
        keys: [
          {
            ...(fixture.jwks.keys as JsonRecord[])[0],
            revoked: true,
          },
        ],
      }),
    });

    const unavailableTrust = await unavailable.verify(fixture.card, { sourceUrl: CARD_URL });
    const expiredTrust = await expired.verify(fixture.card, { sourceUrl: CARD_URL });
    const revokedTrust = await revoked.verify(fixture.card, { sourceUrl: CARD_URL });

    assertState(unavailableTrust, 'key-unavailable');
    assert.strictEqual(unavailableTrust.reason, 'key_fetch_failed');
    assertState(expiredTrust, 'key-unavailable');
    assert.strictEqual(expiredTrust.reason, 'key_expired');
    assertState(revokedTrust, 'key-unavailable');
    assert.strictEqual(revokedTrust.reason, 'key_revoked');
  });

  test('Should enforce same-origin or exact trusted JWKS policy', async () => {
    const offOriginUrl = 'https://keys.example.net/agent.jwks';
    const fixture = createEs256Fixture({ jku: offOriginUrl });
    let fetchCount = 0;
    const blocked = new AgentCardTrustVerifier({
      jwksFetcher: async () => {
        fetchCount += 1;
        return fixture.jwks;
      },
    });
    const trusted = new AgentCardTrustVerifier({
      jwksFetcher: async () => {
        fetchCount += 1;
        return fixture.jwks;
      },
      trustedJwksUrls: [offOriginUrl],
    });

    const blockedTrust = await blocked.verify(fixture.card, { sourceUrl: CARD_URL });
    const trustedTrust = await trusted.verify(fixture.card);

    assertState(blockedTrust, 'key-unavailable');
    assert.strictEqual(blockedTrust.reason, 'untrusted_key_url');
    assertState(trustedTrust, 'verified');
    assert.strictEqual(fetchCount, 1, 'blocked key URLs must not be fetched');
  });

  test('Should cache validated JWKS responses only until the configured expiry', async () => {
    const fixture = createEs256Fixture();
    let now = 1_800_000_000_000;
    let fetchCount = 0;
    const verifier = new AgentCardTrustVerifier({
      cacheTtlMs: 1_000,
      jwksFetcher: async () => {
        fetchCount += 1;
        return fixture.jwks;
      },
      now: () => now,
    });

    assertState(await verifier.verify(fixture.card, { sourceUrl: CARD_URL }), 'verified');
    assertState(await verifier.verify(fixture.card, { sourceUrl: CARD_URL }), 'verified');
    assert.strictEqual(fetchCount, 1);

    now += 1_001;
    assertState(await verifier.verify(fixture.card, { sourceUrl: CARD_URL }), 'verified');
    assert.strictEqual(fetchCount, 2);
  });
});
