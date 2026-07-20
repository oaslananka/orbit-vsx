import {
  createPublicKey,
  verify as verifySignature,
  type JsonWebKey as CryptoJsonWebKey,
  type KeyObject,
} from 'node:crypto';
import { fetchPublicJson } from '../../utils/publicJsonFetch';
import { normalizeHttpUrl, redactUrl } from '../../utils/urlSafety';
import type {
  AgentCardSignature,
  AgentCardTrustReason,
  AgentCardTrustResult,
  AgentCardTrustState,
} from './types';

export type { AgentCardTrustReason, AgentCardTrustResult, AgentCardTrustState } from './types';

const DEFAULT_JWKS_CACHE_TTL_MS = 5 * 60 * 1000;
const JWKS_MAX_JSON_BYTES = 128 * 1024;
const MAX_JWKS_KEYS = 100;
const MAX_KEY_ID_LENGTH = 256;
const SECURITY_HEADER_FIELDS = ['alg', 'kid', 'jku'] as const;
const SUPPORTED_ALGORITHMS = new Set(['ES256', 'RS256']);
const UNSAFE_ALGORITHM_PATTERN = /^(?:none|HS\d+)$/i;
const OMIT_VALUE = Symbol('omit-agent-card-default');

interface AgentCardTrustVerifierOptions {
  cacheTtlMs?: number;
  jwksFetcher?: (url: string) => Promise<unknown>;
  now?: () => number;
  trustedJwksUrls?: string[];
}

interface VerifyContext {
  sourceUrl?: string;
}

interface ProtectedJwsHeader {
  alg: string;
  kid: string;
  jku?: string;
  typ?: string;
  b64?: boolean;
  crit?: unknown;
  [key: string]: unknown;
}

interface PublicJwk extends Record<string, unknown> {
  active?: boolean;
  alg?: string;
  crv?: string;
  exp?: number;
  key_ops?: unknown;
  kid?: string;
  kty?: string;
  nbf?: number;
  revoked?: boolean;
  status?: string;
  use?: string;
}

interface CachedJwks {
  expiresAt: number;
  keys: PublicJwk[];
}

interface SignatureOutcome extends AgentCardTrustResult {
  signatureIndex: number;
}

export class AgentCardTrustVerifier {
  private readonly cache = new Map<string, CachedJwks>();
  private readonly cacheTtlMs: number;
  private readonly jwksFetcher: (url: string) => Promise<unknown>;
  private readonly now: () => number;
  private readonly trustedJwksUrls: Set<string>;

  constructor(options: AgentCardTrustVerifierOptions = {}) {
    this.cacheTtlMs = Math.max(1, options.cacheTtlMs ?? DEFAULT_JWKS_CACHE_TTL_MS);
    this.jwksFetcher =
      options.jwksFetcher ??
      ((url) => fetchPublicJson(url, { maxBytes: JWKS_MAX_JSON_BYTES, maxRedirects: 0 }));
    this.now = options.now ?? Date.now;
    this.trustedJwksUrls = new Set(
      (options.trustedJwksUrls ?? []).map((url) => normalizeJwksUrl(url))
    );
  }

  clearCache(): void {
    this.cache.clear();
  }

  async verify(payload: unknown, context: VerifyContext = {}): Promise<AgentCardTrustResult> {
    const record = asJsonRecord(payload);
    const signaturesValue = record?.signatures;
    if (
      signaturesValue === undefined ||
      (Array.isArray(signaturesValue) && signaturesValue.length === 0)
    ) {
      return trustResult('unsigned', 'no_signatures', 0, 'Agent Card is unsigned.');
    }
    if (!Array.isArray(signaturesValue)) {
      return trustResult(
        'invalid',
        'malformed_signature',
        0,
        'Agent Card signatures are malformed.'
      );
    }

    let canonicalPayload: string;
    try {
      canonicalPayload = canonicalizeAgentCardPayload(payload);
    } catch {
      return trustResult(
        'invalid',
        'canonicalization_failed',
        signaturesValue.length,
        'Agent Card payload cannot be canonicalized safely.'
      );
    }

    const outcomes: SignatureOutcome[] = [];
    for (let index = 0; index < signaturesValue.length; index += 1) {
      const outcome = await this.verifyOne(
        signaturesValue[index],
        canonicalPayload,
        index,
        signaturesValue.length,
        context
      );
      if (outcome.state === 'verified') {
        return {
          ...outcome,
          verifiedSignatureIndex: index,
        };
      }
      outcomes.push(outcome);
    }

    return selectNonVerifiedOutcome(outcomes, signaturesValue.length);
  }

  private async verifyOne(
    signatureValue: unknown,
    canonicalPayload: string,
    signatureIndex: number,
    signatureCount: number,
    context: VerifyContext
  ): Promise<SignatureOutcome> {
    const signature = parseSignature(signatureValue);
    if (!signature) {
      return signatureOutcome(
        'invalid',
        'malformed_signature',
        signatureIndex,
        signatureCount,
        'Agent Card signature is malformed.'
      );
    }

    const protectedHeader = parseProtectedHeader(signature.protected);
    if (!protectedHeader) {
      return signatureOutcome(
        'invalid',
        'malformed_protected_header',
        signatureIndex,
        signatureCount,
        'Agent Card protected signature header is malformed.'
      );
    }

    const headerConflict = findUnprotectedHeaderConflict(signature);
    if (headerConflict) {
      return signatureOutcome(
        'invalid',
        'header_conflict',
        signatureIndex,
        signatureCount,
        `Agent Card signature has a conflicting ${headerConflict} header.`
      );
    }

    const { alg, kid } = protectedHeader;
    if (!alg || !kid || protectedHeader.typ === undefined || kid.length > MAX_KEY_ID_LENGTH) {
      return signatureOutcome(
        'invalid',
        'missing_protected_header',
        signatureIndex,
        signatureCount,
        'Agent Card signature must protect a bounded alg and kid.'
      );
    }
    if (UNSAFE_ALGORITHM_PATTERN.test(alg)) {
      return signatureOutcome(
        'invalid',
        'unsafe_algorithm',
        signatureIndex,
        signatureCount,
        'Agent Card signature uses an unsafe algorithm.',
        { algorithm: alg, keyId: kid }
      );
    }
    if (!SUPPORTED_ALGORITHMS.has(alg)) {
      return signatureOutcome(
        'unverified',
        'unsupported_algorithm',
        signatureIndex,
        signatureCount,
        `Agent Card signature algorithm ${alg} is not supported.`,
        { algorithm: alg, keyId: kid }
      );
    }
    if (protectedHeader.b64 === false) {
      return signatureOutcome(
        'unverified',
        'unsupported_critical_header',
        signatureIndex,
        signatureCount,
        'Unencoded JWS payloads are not supported.',
        { algorithm: alg, keyId: kid }
      );
    }
    if (protectedHeader.crit !== undefined) {
      return signatureOutcome(
        'unverified',
        'unsupported_critical_header',
        signatureIndex,
        signatureCount,
        'JWS critical headers are not supported.',
        { algorithm: alg, keyId: kid }
      );
    }
    if (protectedHeader.typ.toUpperCase() !== 'JOSE') {
      return signatureOutcome(
        'invalid',
        'invalid_typ',
        signatureIndex,
        signatureCount,
        'Agent Card signature typ must be JOSE when present.',
        { algorithm: alg, keyId: kid }
      );
    }

    if (!protectedHeader.jku) {
      return signatureOutcome(
        'key-unavailable',
        'missing_key_url',
        signatureIndex,
        signatureCount,
        'No trusted key URL is available for this signature.',
        { algorithm: alg, keyId: kid }
      );
    }

    let keyUrl: string;
    try {
      keyUrl = normalizeJwksUrl(protectedHeader.jku);
    } catch {
      return signatureOutcome(
        'key-unavailable',
        'invalid_key_url',
        signatureIndex,
        signatureCount,
        'The protected JWKS URL is not a valid public HTTPS URL.',
        { algorithm: alg, keyId: kid }
      );
    }

    if (!this.isTrustedKeyUrl(keyUrl, context.sourceUrl)) {
      return signatureOutcome(
        'key-unavailable',
        'untrusted_key_url',
        signatureIndex,
        signatureCount,
        'The protected JWKS URL is outside the configured trust policy.',
        { algorithm: alg, keyId: kid, keyUrl: redactUrl(keyUrl) }
      );
    }

    let keys: PublicJwk[];
    try {
      keys = await this.getJwks(keyUrl);
    } catch {
      return signatureOutcome(
        'key-unavailable',
        'key_fetch_failed',
        signatureIndex,
        signatureCount,
        'The trusted JWKS could not be retrieved or parsed.',
        { algorithm: alg, keyId: kid, keyUrl: redactUrl(keyUrl) }
      );
    }

    const matchingKeys = keys.filter((key) => key.kid === kid);
    if (matchingKeys.length === 0) {
      return signatureOutcome(
        'key-unavailable',
        'key_not_found',
        signatureIndex,
        signatureCount,
        'No matching verification key was found.',
        { algorithm: alg, keyId: kid, keyUrl: redactUrl(keyUrl) }
      );
    }

    const nowSeconds = Math.floor(this.now() / 1000);
    let lastUnavailableReason: AgentCardTrustReason | undefined;
    let attemptedVerification = false;
    for (const key of matchingKeys) {
      const availability = getKeyAvailability(key, alg, nowSeconds);
      if (availability) {
        lastUnavailableReason = availability;
        continue;
      }
      let publicKey: KeyObject;
      try {
        publicKey = createPublicKey({ key: key as CryptoJsonWebKey, format: 'jwk' });
      } catch {
        lastUnavailableReason = 'key_import_failed';
        continue;
      }

      const signingInput = `${signature.protected}.${Buffer.from(canonicalPayload, 'utf8').toString(
        'base64url'
      )}`;
      const signatureBytes = decodeBase64Url(signature.signature);
      if (!signatureBytes) {
        return signatureOutcome(
          'invalid',
          'malformed_signature',
          signatureIndex,
          signatureCount,
          'Agent Card signature bytes are malformed.',
          { algorithm: alg, keyId: kid, keyUrl: redactUrl(keyUrl) }
        );
      }

      try {
        attemptedVerification = true;
        const valid = verifyWithAlgorithm(alg, publicKey, signingInput, signatureBytes);
        if (valid) {
          return signatureOutcome(
            'verified',
            'verified',
            signatureIndex,
            signatureCount,
            'Agent Card signature is cryptographically verified.',
            { algorithm: alg, keyId: kid, keyUrl: redactUrl(keyUrl) }
          );
        }
      } catch {
        // Treat a verifier/key mismatch as an invalid signature without exposing key material.
      }
    }

    if (!attemptedVerification && lastUnavailableReason) {
      return signatureOutcome(
        'key-unavailable',
        lastUnavailableReason,
        signatureIndex,
        signatureCount,
        keyAvailabilitySummary(lastUnavailableReason),
        { algorithm: alg, keyId: kid, keyUrl: redactUrl(keyUrl) }
      );
    }

    return signatureOutcome(
      'invalid',
      'invalid_signature',
      signatureIndex,
      signatureCount,
      'Agent Card signature does not match the canonical payload.',
      { algorithm: alg, keyId: kid, keyUrl: redactUrl(keyUrl) }
    );
  }

  private isTrustedKeyUrl(keyUrl: string, sourceUrl?: string): boolean {
    if (this.trustedJwksUrls.has(keyUrl)) return true;
    if (!sourceUrl) return false;
    try {
      return new URL(keyUrl).origin === new URL(sourceUrl).origin;
    } catch {
      return false;
    }
  }

  private async getJwks(url: string): Promise<PublicJwk[]> {
    const cached = this.cache.get(url);
    const now = this.now();
    if (cached && cached.expiresAt > now) return cached.keys;
    if (cached) this.cache.delete(url);

    const payload = await this.jwksFetcher(url);
    const keys = parseJwks(payload);
    this.cache.set(url, { expiresAt: now + this.cacheTtlMs, keys });
    return keys;
  }
}

export function canonicalizeAgentCardPayload(payload: unknown): string {
  const prepared = prepareAgentCardValue(payload, '$', true);
  if (prepared === OMIT_VALUE) throw new Error('Agent Card payload is empty.');
  return canonicalizeJson(prepared);
}

export function canonicalizeJson(value: unknown): string {
  if (value === null) return 'null';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('JCS requires finite JSON numbers.');
    return JSON.stringify(value);
  }
  if (typeof value === 'string') {
    assertWellFormedUnicode(value);
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalizeJson(item)).join(',')}]`;
  }
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => {
        assertWellFormedUnicode(key);
        return `${JSON.stringify(key)}:${canonicalizeJson(record[key])}`;
      })
      .join(',')}}`;
  }
  throw new Error(`Unsupported JCS value type: ${typeof value}`);
}

function prepareAgentCardValue(
  value: unknown,
  path: string,
  root = false
): unknown | typeof OMIT_VALUE {
  if (Array.isArray(value)) {
    if (value.length === 0 && !isRequiredCollectionPath(path)) return OMIT_VALUE;
    return value.map((item, index) => {
      const prepared = prepareAgentCardValue(item, `${path}[${index}]`);
      return prepared === OMIT_VALUE ? null : prepared;
    });
  }
  if (typeof value === 'object' && value !== null) {
    const output: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      if (root && key === 'signatures') continue;
      if (child === undefined) continue;
      const prepared = prepareAgentCardValue(child, `${path}.${key}`);
      if (prepared !== OMIT_VALUE) output[key] = prepared;
    }
    return output;
  }
  return value;
}

function isRequiredCollectionPath(path: string): boolean {
  return (
    path === '$.supportedInterfaces' ||
    path === '$.defaultInputModes' ||
    path === '$.defaultOutputModes' ||
    path === '$.skills' ||
    /^\$\.skills\[\d+\]\.tags$/.test(path) ||
    /\.securityRequirements\[\d+\]\.schemes\.[^.]+\.list$/.test(path)
  );
}

function assertWellFormedUnicode(value: string): void {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) {
        throw new Error('JCS input contains an unpaired Unicode surrogate.');
      }
      index += 1;
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      throw new Error('JCS input contains an unpaired Unicode surrogate.');
    }
  }
}

function parseSignature(value: unknown): AgentCardSignature | undefined {
  const record = asJsonRecord(value);
  if (!record || typeof record.protected !== 'string' || typeof record.signature !== 'string') {
    return undefined;
  }
  const signature: AgentCardSignature = {
    protected: record.protected,
    signature: record.signature,
  };
  if (record.header !== undefined) {
    const header = asJsonRecord(record.header);
    if (!header) return undefined;
    signature.header = header;
  }
  return signature;
}

function parseProtectedHeader(value: string): ProtectedJwsHeader | undefined {
  const decoded = decodeBase64Url(value);
  if (!decoded) return undefined;
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(decoded);
    if (hasDuplicateTopLevelJsonKeys(text)) return undefined;
    const record = asJsonRecord(JSON.parse(text));
    if (!record || typeof record.alg !== 'string' || typeof record.kid !== 'string') {
      return undefined;
    }
    if (record.jku !== undefined && typeof record.jku !== 'string') return undefined;
    if (record.typ !== undefined && typeof record.typ !== 'string') return undefined;
    if (record.b64 !== undefined && typeof record.b64 !== 'boolean') return undefined;
    return record as ProtectedJwsHeader;
  } catch {
    return undefined;
  }
}

function findUnprotectedHeaderConflict(signature: AgentCardSignature): string | undefined {
  if (!signature.header) return undefined;
  for (const field of SECURITY_HEADER_FIELDS) {
    if (signature.header[field] !== undefined) return field;
  }
  return undefined;
}

function hasDuplicateTopLevelJsonKeys(text: string): boolean {
  let depth = 0;
  let inString = false;
  let escaped = false;
  let stringStart = -1;
  let keyCandidate = false;
  let expectingKey = false;
  const keys = new Set<string>();

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (character === '\\') {
        escaped = true;
      } else if (character === '"') {
        inString = false;
        if (keyCandidate) {
          let key: string;
          try {
            key = JSON.parse(text.slice(stringStart, index + 1)) as string;
          } catch {
            return true;
          }
          if (keys.has(key)) return true;
          keys.add(key);
          expectingKey = false;
          keyCandidate = false;
        }
      }
      continue;
    }

    if (character === '"') {
      inString = true;
      stringStart = index;
      keyCandidate = depth === 1 && expectingKey;
    } else if (character === '{' || character === '[') {
      depth += 1;
      if (depth === 1 && character === '{') expectingKey = true;
    } else if (character === '}' || character === ']') {
      depth -= 1;
    } else if (character === ',' && depth === 1) {
      expectingKey = true;
    }
  }
  return false;
}

function decodeBase64Url(value: string): Buffer | undefined {
  if (!/^[A-Za-z0-9_-]+$/.test(value) || value.length % 4 === 1) return undefined;
  try {
    const decoded = Buffer.from(value, 'base64url');
    return decoded.toString('base64url') === value ? decoded : undefined;
  } catch {
    return undefined;
  }
}

function normalizeJwksUrl(value: string): string {
  const normalized = normalizeHttpUrl(value, {
    allowLocalhost: false,
    allowPrivateNetwork: false,
    label: 'Agent Card JWKS URL',
  });
  const parsed = new URL(normalized);
  if (parsed.protocol !== 'https:') throw new Error('Agent Card JWKS URL must use HTTPS.');
  return parsed.toString();
}

function parseJwks(value: unknown): PublicJwk[] {
  const record = asJsonRecord(value);
  if (!record || !Array.isArray(record.keys) || record.keys.length > MAX_JWKS_KEYS) {
    throw new Error('JWKS must contain a bounded keys array.');
  }
  return record.keys.map((key) => {
    const parsed = asJsonRecord(key);
    if (!parsed) throw new Error('JWKS key must be an object.');
    return parsed as PublicJwk;
  });
}

function getKeyAvailability(
  key: PublicJwk,
  algorithm: string,
  nowSeconds: number
): AgentCardTrustReason | undefined {
  if (containsPrivateOrSymmetricKeyMaterial(key)) return 'key_import_failed';
  if (key.revoked === true || key.active === false || key.status?.toLowerCase() === 'revoked') {
    return 'key_revoked';
  }
  if (typeof key.exp === 'number' && key.exp <= nowSeconds) return 'key_expired';
  if (typeof key.nbf === 'number' && key.nbf > nowSeconds) return 'key_not_yet_valid';
  if (key.alg !== undefined && key.alg !== algorithm) return 'key_algorithm_mismatch';
  if (key.use !== undefined && key.use !== 'sig') return 'key_usage_mismatch';
  if (key.key_ops !== undefined) {
    if (!Array.isArray(key.key_ops) || !key.key_ops.includes('verify')) return 'key_usage_mismatch';
  }
  if (algorithm === 'ES256' && (key.kty !== 'EC' || key.crv !== 'P-256')) {
    return 'key_algorithm_mismatch';
  }
  if (algorithm === 'RS256' && key.kty !== 'RSA') return 'key_algorithm_mismatch';
  return undefined;
}

function containsPrivateOrSymmetricKeyMaterial(key: PublicJwk): boolean {
  return ['d', 'p', 'q', 'dp', 'dq', 'qi', 'oth', 'k'].some((field) => key[field] !== undefined);
}

function verifyWithAlgorithm(
  algorithm: string,
  key: KeyObject,
  signingInput: string,
  signature: Buffer
): boolean {
  const data = Buffer.from(signingInput, 'ascii');
  if (algorithm === 'ES256') {
    if (signature.length !== 64) return false;
    return verifySignature('sha256', data, { key, dsaEncoding: 'ieee-p1363' }, signature);
  }
  if (algorithm === 'RS256') {
    return verifySignature('RSA-SHA256', data, key, signature);
  }
  return false;
}

function selectNonVerifiedOutcome(
  outcomes: SignatureOutcome[],
  signatureCount: number
): AgentCardTrustResult {
  const selected =
    outcomes.find((outcome) => outcome.state === 'invalid') ??
    outcomes.find((outcome) => outcome.state === 'key-unavailable') ??
    outcomes.find((outcome) => outcome.state === 'unverified');
  if (!selected) {
    return trustResult(
      'unverified',
      'unsupported_algorithm',
      signatureCount,
      'No Agent Card signature could be verified.'
    );
  }
  const result = trustResult(
    selected.state,
    selected.reason,
    selected.signatureCount,
    selected.summary
  );
  if (selected.algorithm !== undefined) result.algorithm = selected.algorithm;
  if (selected.keyId !== undefined) result.keyId = selected.keyId;
  if (selected.keyUrl !== undefined) result.keyUrl = selected.keyUrl;
  return result;
}

function signatureOutcome(
  state: AgentCardTrustState,
  reason: AgentCardTrustReason,
  signatureIndex: number,
  signatureCount: number,
  summary: string,
  metadata: Pick<AgentCardTrustResult, 'algorithm' | 'keyId' | 'keyUrl'> = {}
): SignatureOutcome {
  return {
    ...trustResult(state, reason, signatureCount, summary),
    ...metadata,
    signatureIndex,
  };
}

function trustResult(
  state: AgentCardTrustState,
  reason: AgentCardTrustReason,
  signatureCount: number,
  summary: string
): AgentCardTrustResult {
  return { reason, signatureCount, state, summary };
}

function keyAvailabilitySummary(reason: AgentCardTrustReason): string {
  switch (reason) {
    case 'key_expired':
      return 'The matching Agent Card verification key is expired.';
    case 'key_revoked':
      return 'The matching Agent Card verification key is revoked.';
    case 'key_not_yet_valid':
      return 'The matching Agent Card verification key is not active yet.';
    case 'key_algorithm_mismatch':
      return 'The matching Agent Card key is incompatible with the protected algorithm.';
    case 'key_usage_mismatch':
      return 'The matching Agent Card key is not authorized for signature verification.';
    default:
      return 'The matching Agent Card verification key cannot be used.';
  }
}

function asJsonRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}
