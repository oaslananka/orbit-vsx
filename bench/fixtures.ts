import { generateKeyPairSync, sign } from 'node:crypto';

export type JsonRecord = Record<string, unknown>;

export const CARD_URL = 'https://agent.example/.well-known/agent-card.json';
export const JWKS_URL = 'https://agent.example/.well-known/jwks.json';

export function agentCard(skillCount = 1): JsonRecord {
  return {
    capabilities: { pushNotifications: false, streaming: true },
    defaultInputModes: ['application/json', 'text/plain'],
    defaultOutputModes: ['application/json'],
    description: 'Answers support questions',
    documentationUrl: 'https://agent.example/docs',
    name: 'support-agent',
    provider: { organization: 'Example Inc.', url: 'https://example.com' },
    securitySchemes: {
      bearerAuth: { scheme: 'bearer', type: 'http' },
    },
    skills: Array.from({ length: skillCount }, (_, index) => ({
      description: `Answer questions for topic ${index}`,
      id: `answer_questions_${index}`,
      name: `Answer Questions ${index}`,
      tags: ['support', 'qa', `topic-${index}`],
      examples: [`How do I configure feature ${index}?`, `Explain error ${index}`],
    })),
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

function base64UrlJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
}

/** Builds an ES256-signed Agent Card and the matching JWKS document. */
export function signedEs256Card(skillCount = 1): { card: JsonRecord; jwks: JsonRecord } {
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const keyId = 'agent-signing-key-1';
  const protectedValue = base64UrlJson({ alg: 'ES256', jku: JWKS_URL, kid: keyId, typ: 'JOSE' });
  const payload = agentCard(skillCount);
  const signingInput = `${protectedValue}.${Buffer.from(JSON.stringify(payload), 'utf8').toString(
    'base64url'
  )}`;
  const signature = sign('sha256', Buffer.from(signingInput, 'ascii'), {
    key: privateKey,
    dsaEncoding: 'ieee-p1363',
  }).toString('base64url');
  const publicJwk = publicKey.export({ format: 'jwk' }) as JsonRecord;
  return {
    card: { ...payload, signatures: [{ protected: protectedValue, signature }] },
    jwks: {
      keys: [{ ...publicJwk, alg: 'ES256', kid: keyId, key_ops: ['verify'], use: 'sig' }],
    },
  };
}
