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
const SUPPORTED_ALGORITHMS = new Set<SupportedAlgorithm>(['ES256', 'RS256']);
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

type SupportedAlgorithm = 'ES256' | 'RS256';
type JsonPrimitive = null | boolean | number | string;
type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
type PreparedAgentCardValue = JsonValue | typeof OMIT_VALUE;

interface PreparedSignatureContext {
  algorithm: SupportedAlgorithm;
  keyId: string;
  protectedHeader: ProtectedJwsHeader;
  signature: AgentCardSignature;
  signatureBytes: Buffer;
  signatureCount: number;
  signatureIndex: number;
  signingInput: string;
}

interface ResolvedSignatureContext extends PreparedSignatureContext {
  keyUrl: string;
  redactedKeyUrl: string;
}

type SignaturePreparationResult =
  | { ok: true; context: PreparedSignatureContext }
  | { ok: false; outcome: SignatureOutcome };

type SignatureResolutionResult =
  | { ok: true; context: ResolvedSignatureContext }
  | { ok: false; outcome: SignatureOutcome };

type MatchingKeysResult =
  | { ok: true; keys: PublicJwk[] }
  | { ok: false; outcome: SignatureOutcome };

type RejectedSignatureResult = { ok: false; outcome: SignatureOutcome };

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
    const preparation = this.prepareSignature(
      signatureValue,
      canonicalPayload,
      signatureIndex,
      signatureCount
    );
    if (!preparation.ok) return preparation.outcome;

    const resolution = this.resolveSignatureKey(preparation.context, context.sourceUrl);
    if (!resolution.ok) return resolution.outcome;

    const matchingKeys = await this.loadMatchingKeys(resolution.context);
    if (!matchingKeys.ok) return matchingKeys.outcome;

    return this.verifyMatchingKeys(resolution.context, matchingKeys.keys);
  }

  private prepareSignature(
    signatureValue: unknown,
    canonicalPayload: string,
    signatureIndex: number,
    signatureCount: number
  ): SignaturePreparationResult {
    const signature = parseSignature(signatureValue);
    if (!signature) {
      return rejectedPreparation(
        'invalid',
        'malformed_signature',
        signatureIndex,
        signatureCount,
        'Agent Card signature is malformed.'
      );
    }

    const protectedHeader = parseProtectedHeader(signature.protected);
    if (!protectedHeader) {
      return rejectedPreparation(
        'invalid',
        'malformed_protected_header',
        signatureIndex,
        signatureCount,
        'Agent Card protected signature header is malformed.'
      );
    }

    const headerConflict = findUnprotectedHeaderConflict(signature);
    if (headerConflict) {
      return rejectedPreparation(
        'invalid',
        'header_conflict',
        signatureIndex,
        signatureCount,
        `Agent Card signature has a conflicting ${headerConflict} header.`
      );
    }

    const { alg, kid, typ } = protectedHeader;
    if (!alg || !kid || typ === undefined || kid.length > MAX_KEY_ID_LENGTH) {
      return rejectedPreparation(
        'invalid',
        'missing_protected_header',
        signatureIndex,
        signatureCount,
        'Agent Card signature must protect a bounded alg, typ, and kid.'
      );
    }
    if (UNSAFE_ALGORITHM_PATTERN.test(alg)) {
      return rejectedPreparation(
        'invalid',
        'unsafe_algorithm',
        signatureIndex,
        signatureCount,
        'Agent Card signature uses an unsafe algorithm.',
        { algorithm: alg, keyId: kid }
      );
    }
    if (!isSupportedAlgorithm(alg)) {
      return rejectedPreparation(
        'unverified',
        'unsupported_algorithm',
        signatureIndex,
        signatureCount,
        `Agent Card signature algorithm ${alg} is not supported.`,
        { algorithm: alg, keyId: kid }
      );
    }
    if (protectedHeader.b64 === false || protectedHeader.crit !== undefined) {
      return rejectedPreparation(
        'unverified',
        'unsupported_critical_header',
        signatureIndex,
        signatureCount,
        'JWS critical headers and unencoded payloads are not supported.',
        { algorithm: alg, keyId: kid }
      );
    }
    if (typ.toUpperCase() !== 'JOSE') {
      return rejectedPreparation(
        'invalid',
        'invalid_typ',
        signatureIndex,
        signatureCount,
        'Agent Card signature typ must be JOSE.',
        { algorithm: alg, keyId: kid }
      );
    }

    const signatureBytes = decodeBase64Url(signature.signature);
    if (!signatureBytes) {
      return rejectedPreparation(
        'invalid',
        'malformed_signature',
        signatureIndex,
        signatureCount,
        'Agent Card signature bytes are malformed.',
        { algorithm: alg, keyId: kid }
      );
    }

    const payloadValue = Buffer.from(canonicalPayload, 'utf8').toString('base64url');
    return {
      ok: true,
      context: {
        algorithm: alg,
        keyId: kid,
        protectedHeader,
        signature,
        signatureBytes,
        signatureCount,
        signatureIndex,
        signingInput: `${signature.protected}.${payloadValue}`,
      },
    };
  }

  private resolveSignatureKey(
    context: PreparedSignatureContext,
    sourceUrl?: string
  ): SignatureResolutionResult {
    const keyUrlValue = context.protectedHeader.jku;
    if (!keyUrlValue) {
      return rejectedResolution(
        context,
        'missing_key_url',
        'No trusted key URL is available for this signature.'
      );
    }

    let keyUrl: string;
    try {
      keyUrl = normalizeJwksUrl(keyUrlValue);
    } catch {
      return rejectedResolution(
        context,
        'invalid_key_url',
        'The protected JWKS URL is not a valid public HTTPS URL.'
      );
    }

    const resolved = { ...context, keyUrl, redactedKeyUrl: redactUrl(keyUrl) };
    if (!this.isTrustedKeyUrl(keyUrl, sourceUrl)) {
      return rejectedResolvedContext(
        resolved,
        'untrusted_key_url',
        'The protected JWKS URL is outside the configured trust policy.'
      );
    }
    return { ok: true, context: resolved };
  }

  private async loadMatchingKeys(context: ResolvedSignatureContext): Promise<MatchingKeysResult> {
    let keys: PublicJwk[];
    try {
      keys = await this.getJwks(context.keyUrl);
    } catch {
      return rejectedResolvedContext(
        context,
        'key_fetch_failed',
        'The trusted JWKS could not be retrieved or parsed.'
      );
    }

    const matchingKeys = keys.filter((key) => key.kid === context.keyId);
    if (matchingKeys.length === 0) {
      return rejectedResolvedContext(
        context,
        'key_not_found',
        'No matching verification key was found.'
      );
    }
    return { ok: true, keys: matchingKeys };
  }

  private verifyMatchingKeys(
    context: ResolvedSignatureContext,
    matchingKeys: PublicJwk[]
  ): SignatureOutcome {
    const nowSeconds = Math.floor(this.now() / 1000);
    let lastUnavailableReason: AgentCardTrustReason | undefined;
    let attemptedVerification = false;

    for (const key of matchingKeys) {
      const availability = getKeyAvailability(key, context.algorithm, nowSeconds);
      if (availability) {
        lastUnavailableReason = availability;
        continue;
      }

      const publicKey = importPublicKey(key);
      if (!publicKey) {
        lastUnavailableReason = 'key_import_failed';
        continue;
      }

      attemptedVerification = true;
      if (isSignatureValid(context, publicKey)) {
        return outcomeForResolvedContext(
          context,
          'verified',
          'verified',
          'Agent Card signature is cryptographically verified.'
        );
      }
    }

    if (!attemptedVerification && lastUnavailableReason) {
      return outcomeForResolvedContext(
        context,
        'key-unavailable',
        lastUnavailableReason,
        keyAvailabilitySummary(lastUnavailableReason)
      );
    }
    return outcomeForResolvedContext(
      context,
      'invalid',
      'invalid_signature',
      'Agent Card signature does not match the canonical payload.'
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
  return canonicalizeJsonValue(asCanonicalJsonValue(value));
}

function canonicalizeJsonValue(value: JsonValue): string {
  if (value === null) return 'null';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') return JSON.stringify(value);
  if (typeof value === 'string') return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalizeJsonValue(item)).join(',')}]`;
  }

  const keys = sortUtf16Keys(Object.keys(value));
  const properties = keys.map(
    (key) => `${JSON.stringify(key)}:${canonicalizeJsonValue(value[key] as JsonValue)}`
  );
  return `{${properties.join(',')}}`;
}

function asCanonicalJsonValue(value: unknown): JsonValue {
  if (value === null || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('JCS requires finite JSON numbers.');
    return value;
  }
  if (typeof value === 'string') {
    assertWellFormedUnicode(value);
    return value;
  }
  if (Array.isArray(value)) return value.map((item) => asCanonicalJsonValue(item));

  const record = asJsonRecord(value);
  if (!record) throw new Error(`Unsupported JCS value type: ${typeof value}`);
  const output: { [key: string]: JsonValue } = {};
  for (const [key, child] of Object.entries(record)) {
    assertWellFormedUnicode(key);
    output[key] = asCanonicalJsonValue(child);
  }
  return output;
}

function sortUtf16Keys(keys: string[]): string[] {
  const sorted: string[] = [];
  for (const key of keys) {
    let position = sorted.length;
    while (position > 0 && compareUtf16(key, sorted[position - 1] as string) < 0) position -= 1;
    sorted.splice(position, 0, key);
  }
  return sorted;
}

function compareUtf16(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function prepareAgentCardValue(value: unknown, path: string, root = false): PreparedAgentCardValue {
  if (isJsonPrimitive(value)) return value;
  if (Array.isArray(value)) return prepareAgentCardArray(value, path);

  const record = asJsonRecord(value);
  if (!record) throw new Error(`Unsupported Agent Card value type: ${typeof value}`);
  return prepareAgentCardObject(record, path, root);
}

function prepareAgentCardArray(value: unknown[], path: string): JsonValue[] | typeof OMIT_VALUE {
  if (value.length === 0 && !isRequiredCollectionPath(path)) return OMIT_VALUE;
  return value.map((item, index) => {
    const prepared = prepareAgentCardValue(item, `${path}[${index}]`);
    return prepared === OMIT_VALUE ? null : prepared;
  });
}

function prepareAgentCardObject(
  value: Record<string, unknown>,
  path: string,
  root: boolean
): { [key: string]: JsonValue } {
  const output: { [key: string]: JsonValue } = {};
  for (const [key, child] of Object.entries(value)) {
    if (root && key === 'signatures') continue;
    if (child === undefined) continue;
    const prepared = prepareAgentCardValue(child, `${path}.${key}`);
    if (prepared !== OMIT_VALUE) output[key] = prepared;
  }
  return output;
}

function isJsonPrimitive(value: unknown): value is JsonPrimitive {
  return (
    value === null ||
    typeof value === 'boolean' ||
    typeof value === 'number' ||
    typeof value === 'string'
  );
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
    const codePoint = value.codePointAt(index);
    if (codePoint === undefined) break;
    if (codePoint >= 0xd800 && codePoint <= 0xdfff) {
      throw new Error('JCS input contains an unpaired Unicode surrogate.');
    }
    if (codePoint > 0xffff) index += 1;
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
  return new TopLevelJsonKeyScanner(text).hasDuplicateKey();
}

class TopLevelJsonKeyScanner {
  private depth = 0;
  private escaped = false;
  private expectingKey = false;
  private inString = false;
  private keyCandidate = false;
  private readonly keys = new Set<string>();
  private stringStart = -1;

  constructor(private readonly text: string) {}

  hasDuplicateKey(): boolean {
    for (let index = 0; index < this.text.length; index += 1) {
      const character = this.text[index] as string;
      if (this.inString) {
        if (this.consumeStringCharacter(character, index)) return true;
      } else {
        this.consumeStructuralCharacter(character, index);
      }
    }
    return false;
  }

  private consumeStringCharacter(character: string, index: number): boolean {
    if (this.escaped) {
      this.escaped = false;
      return false;
    }
    if (character === '\\') {
      this.escaped = true;
      return false;
    }
    if (character !== '"') return false;

    this.inString = false;
    return this.keyCandidate ? this.finishKey(index) : false;
  }

  private finishKey(index: number): boolean {
    const key = this.decodeCurrentString(index);
    if (key === undefined || this.keys.has(key)) return true;
    this.keys.add(key);
    this.expectingKey = false;
    this.keyCandidate = false;
    return false;
  }

  private decodeCurrentString(index: number): string | undefined {
    try {
      return JSON.parse(this.text.slice(this.stringStart, index + 1)) as string;
    } catch {
      return undefined;
    }
  }

  private consumeStructuralCharacter(character: string, index: number): void {
    if (character === '"') {
      this.inString = true;
      this.stringStart = index;
      this.keyCandidate = this.depth === 1 && this.expectingKey;
      return;
    }
    if (character === '{' || character === '[') {
      this.depth += 1;
      if (this.depth === 1 && character === '{') this.expectingKey = true;
      return;
    }
    if (character === '}' || character === ']') {
      this.depth -= 1;
      return;
    }
    if (character === ',' && this.depth === 1) this.expectingKey = true;
  }
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
  algorithm: SupportedAlgorithm,
  nowSeconds: number
): AgentCardTrustReason | undefined {
  return (
    getKeyMaterialReason(key) ??
    getKeyLifecycleReason(key, nowSeconds) ??
    getKeyUsageReason(key) ??
    getKeyAlgorithmReason(key, algorithm)
  );
}

function getKeyMaterialReason(key: PublicJwk): AgentCardTrustReason | undefined {
  return containsPrivateOrSymmetricKeyMaterial(key) ? 'key_import_failed' : undefined;
}

function getKeyLifecycleReason(
  key: PublicJwk,
  nowSeconds: number
): AgentCardTrustReason | undefined {
  if (key.revoked === true || key.active === false || key.status?.toLowerCase() === 'revoked') {
    return 'key_revoked';
  }
  if (typeof key.exp === 'number' && key.exp <= nowSeconds) return 'key_expired';
  if (typeof key.nbf === 'number' && key.nbf > nowSeconds) return 'key_not_yet_valid';
  return undefined;
}

function getKeyUsageReason(key: PublicJwk): AgentCardTrustReason | undefined {
  if (key.use !== undefined && key.use !== 'sig') return 'key_usage_mismatch';
  if (key.key_ops === undefined) return undefined;
  return Array.isArray(key.key_ops) && key.key_ops.includes('verify')
    ? undefined
    : 'key_usage_mismatch';
}

function getKeyAlgorithmReason(
  key: PublicJwk,
  algorithm: SupportedAlgorithm
): AgentCardTrustReason | undefined {
  if (key.alg !== undefined && key.alg !== algorithm) return 'key_algorithm_mismatch';
  if (algorithm === 'ES256') {
    return key.kty === 'EC' && key.crv === 'P-256' ? undefined : 'key_algorithm_mismatch';
  }
  return key.kty === 'RSA' ? undefined : 'key_algorithm_mismatch';
}

function containsPrivateOrSymmetricKeyMaterial(key: PublicJwk): boolean {
  return ['d', 'p', 'q', 'dp', 'dq', 'qi', 'oth', 'k'].some((field) => key[field] !== undefined);
}

function isSupportedAlgorithm(value: string): value is SupportedAlgorithm {
  return SUPPORTED_ALGORITHMS.has(value as SupportedAlgorithm);
}

function importPublicKey(key: PublicJwk): KeyObject | undefined {
  try {
    return createPublicKey({ key: key as CryptoJsonWebKey, format: 'jwk' });
  } catch {
    return undefined;
  }
}

function isSignatureValid(context: ResolvedSignatureContext, key: KeyObject): boolean {
  try {
    return verifyWithAlgorithm(
      context.algorithm,
      key,
      context.signingInput,
      context.signatureBytes
    );
  } catch {
    return false;
  }
}

function rejectedPreparation(
  state: AgentCardTrustState,
  reason: AgentCardTrustReason,
  signatureIndex: number,
  signatureCount: number,
  summary: string,
  metadata: Pick<AgentCardTrustResult, 'algorithm' | 'keyId' | 'keyUrl'> = {}
): SignaturePreparationResult {
  return {
    ok: false,
    outcome: signatureOutcome(state, reason, signatureIndex, signatureCount, summary, metadata),
  };
}

function rejectedResolution(
  context: PreparedSignatureContext,
  reason: AgentCardTrustReason,
  summary: string
): SignatureResolutionResult {
  return {
    ok: false,
    outcome: signatureOutcome(
      'key-unavailable',
      reason,
      context.signatureIndex,
      context.signatureCount,
      summary,
      { algorithm: context.algorithm, keyId: context.keyId }
    ),
  };
}

function rejectedResolvedContext(
  context: ResolvedSignatureContext,
  reason: AgentCardTrustReason,
  summary: string
): RejectedSignatureResult {
  return {
    ok: false,
    outcome: outcomeForResolvedContext(context, 'key-unavailable', reason, summary),
  };
}

function outcomeForResolvedContext(
  context: ResolvedSignatureContext,
  state: AgentCardTrustState,
  reason: AgentCardTrustReason,
  summary: string
): SignatureOutcome {
  return signatureOutcome(state, reason, context.signatureIndex, context.signatureCount, summary, {
    algorithm: context.algorithm,
    keyId: context.keyId,
    keyUrl: context.redactedKeyUrl,
  });
}

function verifyWithAlgorithm(
  algorithm: SupportedAlgorithm,
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
