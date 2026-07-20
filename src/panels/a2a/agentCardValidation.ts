import { normalizeHttpUrl } from '../../utils/urlSafety';
import type {
  AgentCapabilities,
  AgentCard,
  AgentCardSignature,
  AgentExtension,
  AgentInterface,
  AgentProvider,
  AgentRegistryEntry,
  AgentSkill,
  AuthScheme,
  SecurityRequirement,
  SecurityScheme,
  ValidationIssue,
  ValidationResult,
} from './types';

const MAX_CARD_JSON_BYTES = 256 * 1024;
const WELL_KNOWN_AGENT_CARD_PATH = '/.well-known/agent-card.json';
const SECRET_KEY_PATTERN =
  /(^|[-_.])(password|passwd|secret|token|access[_-]?key|private[_-]?key|client[_-]?secret)([-_.]|$)/i;
const SECURITY_SCHEME_WRAPPER_KEYS = [
  'apiKeySecurityScheme',
  'httpAuthSecurityScheme',
  'oauth2SecurityScheme',
  'openIdConnectSecurityScheme',
  'mtlsSecurityScheme',
] as const;
const LEGACY_SECURITY_SCHEME_TYPES = [
  'apiKey',
  'http',
  'oauth2',
  'openIdConnect',
  'mutualTLS',
] as const;

export class AgentCardValidationError extends Error {
  constructor(public readonly issues: ValidationIssue[]) {
    super(issues.map((issue) => `${issue.path}: ${issue.message}`).join('\n'));
    this.name = 'AgentCardValidationError';
  }
}

export function resolveAgentCardDiscoveryUrl(input: string): string {
  const safeUrl = normalizeHttpUrl(input, {
    allowLocalhost: false,
    allowPrivateNetwork: false,
    label: 'Agent card discovery URL',
  });
  const url = new URL(safeUrl);
  if (url.protocol !== 'https:') {
    throw new Error('Agent card discovery URL must use HTTPS');
  }
  const hasExplicitCardPath = url.pathname !== '/' && url.pathname !== '';
  if (!hasExplicitCardPath) {
    url.pathname = WELL_KNOWN_AGENT_CARD_PATH;
  }
  return url.toString();
}

export function validateAgentRegistryPayload(value: unknown): AgentRegistryEntry[] {
  if (!Array.isArray(value)) {
    throw new AgentCardValidationError([
      { path: '$', message: 'registry response must be an array' },
    ]);
  }
  return value.map((entry, index) => validateAgentRegistryEntryPayload(entry, `$[${index}]`));
}

export function validateAgentRegistryEntryPayload(value: unknown, path = '$'): AgentRegistryEntry {
  const issues: ValidationIssue[] = [];
  const record = asRecord(value, path, issues);
  const card = validateAgentCardPayload(record.card, `${path}.card`);
  const online = asBoolean(record.online, `${path}.online`, issues);
  const lastSeen = asNonEmptyString(record.lastSeen, `${path}.lastSeen`, issues);
  throwIfIssues(issues);
  return {
    card,
    lastSeen,
    online,
    validation: { valid: true, errors: [] },
  };
}

export function validateAgentCardPayload(value: unknown, path = '$'): AgentCard {
  const issues: ValidationIssue[] = [];
  const record = asRecord(value, path, issues);
  rejectSensitiveKeys(value, path, issues);

  const name = asNonEmptyString(record.name, `${path}.name`, issues);
  const description = asNonEmptyString(record.description, `${path}.description`, issues);
  const version = asNonEmptyString(record.version, `${path}.version`, issues);
  const supportedInterfaces = asArray(
    record.supportedInterfaces,
    `${path}.supportedInterfaces`,
    issues
  ).map((item, index) =>
    validateAgentInterface(item, `${path}.supportedInterfaces[${index}]`, issues)
  );
  if (supportedInterfaces.length === 0) {
    issues.push({
      path: `${path}.supportedInterfaces`,
      message: 'at least one interface is required',
    });
  }

  const capabilities = validateCapabilities(record.capabilities, `${path}.capabilities`, issues);
  const defaultInputModes = asStringArray(
    record.defaultInputModes,
    `${path}.defaultInputModes`,
    issues
  );
  const defaultOutputModes = asStringArray(
    record.defaultOutputModes,
    `${path}.defaultOutputModes`,
    issues
  );
  const skills = asArray(record.skills, `${path}.skills`, issues).map((item, index) =>
    validateAgentSkill(item, `${path}.skills[${index}]`, issues)
  );
  if (skills.length === 0) {
    issues.push({ path: `${path}.skills`, message: 'at least one skill is required' });
  }

  const card: AgentCard = {
    capabilities,
    defaultInputModes,
    defaultOutputModes,
    description,
    name,
    skills,
    supportedInterfaces,
    version,
  };

  if (record.provider !== undefined)
    card.provider = validateProvider(record.provider, `${path}.provider`, issues);
  if (record.documentationUrl !== undefined) {
    card.documentationUrl = validatePublicHttpsUrl(
      record.documentationUrl,
      `${path}.documentationUrl`,
      issues
    );
  }
  if (record.iconUrl !== undefined) {
    card.iconUrl = validatePublicHttpsUrl(record.iconUrl, `${path}.iconUrl`, issues);
  }
  if (record.securitySchemes !== undefined) {
    card.securitySchemes = validateSecuritySchemes(
      record.securitySchemes,
      `${path}.securitySchemes`,
      issues
    );
  }
  const securityRequirements = validateCardSecurityRequirements(record, path, issues);
  if (securityRequirements !== undefined) {
    card.securityRequirements = securityRequirements;
  }
  if (record.signatures !== undefined) {
    card.signatures = asArray(record.signatures, `${path}.signatures`, issues).map((item, index) =>
      validateSignature(item, `${path}.signatures[${index}]`, issues)
    );
  }
  if (record.url !== undefined)
    card.url = validatePublicHttpsUrl(record.url, `${path}.url`, issues);
  if (record.authentication !== undefined) {
    card.authentication = validateLegacyAuthentication(
      record.authentication,
      `${path}.authentication`,
      issues
    );
  }

  throwIfIssues(issues);
  return card;
}

export function validateAgentCardText(text: string): ValidationResult {
  if (Buffer.byteLength(text, 'utf8') > MAX_CARD_JSON_BYTES) {
    return resultFromIssues([{ path: '$', message: 'agent card JSON is too large' }]);
  }
  try {
    validateAgentCardPayload(JSON.parse(text));
    return { valid: true, errors: [] };
  } catch (error) {
    if (error instanceof SyntaxError) {
      return resultFromIssues([{ path: '$', message: `invalid JSON: ${error.message}` }]);
    }
    if (error instanceof AgentCardValidationError) {
      return resultFromIssues(error.issues);
    }
    return resultFromIssues([
      { path: '$', message: error instanceof Error ? error.message : String(error) },
    ]);
  }
}

export function resultFromIssues(issues: ValidationIssue[]): ValidationResult {
  return {
    errors: issues.map((issue) => `${issue.path}: ${issue.message}`),
    issues,
    valid: issues.length === 0,
  };
}

function validateProvider(value: unknown, path: string, issues: ValidationIssue[]): AgentProvider {
  const record = asRecord(value, path, issues);
  const provider: AgentProvider = {
    organization: asNonEmptyString(record.organization, `${path}.organization`, issues),
  };
  if (record.url !== undefined)
    provider.url = validatePublicHttpsUrl(record.url, `${path}.url`, issues);
  return provider;
}

function validateAgentInterface(
  value: unknown,
  path: string,
  issues: ValidationIssue[]
): AgentInterface {
  const record = asRecord(value, path, issues);
  const agentInterface: AgentInterface = {
    protocolBinding: asNonEmptyString(record.protocolBinding, `${path}.protocolBinding`, issues),
    protocolVersion: asNonEmptyString(record.protocolVersion, `${path}.protocolVersion`, issues),
    url: validatePublicHttpsUrl(record.url, `${path}.url`, issues),
  };
  if (record.tenant !== undefined) {
    agentInterface.tenant = asNonEmptyString(record.tenant, `${path}.tenant`, issues);
  }
  return agentInterface;
}

function validateCapabilities(
  value: unknown,
  path: string,
  issues: ValidationIssue[]
): AgentCapabilities {
  const record = asRecord(value, path, issues);
  const capabilities: AgentCapabilities = {};
  if (record.streaming !== undefined)
    capabilities.streaming = asBoolean(record.streaming, `${path}.streaming`, issues);
  if (record.pushNotifications !== undefined) {
    capabilities.pushNotifications = asBoolean(
      record.pushNotifications,
      `${path}.pushNotifications`,
      issues
    );
  }
  if (record.stateTransitionHistory !== undefined) {
    capabilities.stateTransitionHistory = asBoolean(
      record.stateTransitionHistory,
      `${path}.stateTransitionHistory`,
      issues
    );
  }
  if (record.extendedAgentCard !== undefined) {
    capabilities.extendedAgentCard = asBoolean(
      record.extendedAgentCard,
      `${path}.extendedAgentCard`,
      issues
    );
  }
  if (record.extensions !== undefined) {
    capabilities.extensions = asArray(record.extensions, `${path}.extensions`, issues).map(
      (item, index) => validateExtension(item, `${path}.extensions[${index}]`, issues)
    );
  }
  return capabilities;
}

function validateExtension(
  value: unknown,
  path: string,
  issues: ValidationIssue[]
): AgentExtension {
  const record = asRecord(value, path, issues);
  const extension: AgentExtension = {
    uri: asNonEmptyString(record.uri, `${path}.uri`, issues),
  };
  if (record.description !== undefined) {
    extension.description = asNonEmptyString(record.description, `${path}.description`, issues);
  }
  if (record.required !== undefined)
    extension.required = asBoolean(record.required, `${path}.required`, issues);
  return extension;
}

function validateAgentSkill(value: unknown, path: string, issues: ValidationIssue[]): AgentSkill {
  const record = asRecord(value, path, issues);
  const skill: AgentSkill = {
    description: asNonEmptyString(record.description, `${path}.description`, issues),
    id: asNonEmptyString(record.id, `${path}.id`, issues),
    name: asNonEmptyString(record.name, `${path}.name`, issues),
    tags: asStringArray(record.tags, `${path}.tags`, issues),
  };
  if (skill.tags.length === 0) {
    issues.push({ path: `${path}.tags`, message: 'at least one tag is required' });
  }
  if (record.examples !== undefined)
    skill.examples = asStringArray(record.examples, `${path}.examples`, issues);
  if (record.inputModes !== undefined)
    skill.inputModes = asStringArray(record.inputModes, `${path}.inputModes`, issues);
  if (record.outputModes !== undefined)
    skill.outputModes = asStringArray(record.outputModes, `${path}.outputModes`, issues);
  if (record.securityRequirements !== undefined) {
    skill.securityRequirements = validateSecurityRequirements(
      record.securityRequirements,
      `${path}.securityRequirements`,
      issues
    );
  }
  return skill;
}

function validateSecuritySchemes(
  value: unknown,
  path: string,
  issues: ValidationIssue[]
): Record<string, SecurityScheme> {
  const record = asRecord(value, path, issues);
  const schemes: Record<string, SecurityScheme> = {};
  for (const [key, schemeValue] of Object.entries(record)) {
    schemes[key] = validateSecurityScheme(schemeValue, `${path}.${key}`, issues);
  }
  return schemes;
}

function validateSecurityScheme(
  value: unknown,
  path: string,
  issues: ValidationIssue[]
): SecurityScheme {
  const record = asRecord(value, path, issues);
  const wrapperKeys = SECURITY_SCHEME_WRAPPER_KEYS.filter((key) => record[key] !== undefined);

  if (record.type !== undefined) {
    if (wrapperKeys.length > 0) {
      issues.push({ path, message: 'legacy type and A2A 1.0 wrapper must not be mixed' });
    }
    return validateLegacySecurityScheme(record, path, issues);
  }

  if (wrapperKeys.length !== 1) {
    issues.push({ path, message: 'expected exactly one security scheme wrapper' });
    return { mtlsSecurityScheme: {} };
  }

  const wrapperKey = wrapperKeys[0];
  const wrapper = asRecord(record[wrapperKey], `${path}.${wrapperKey}`, issues);
  if (wrapperKey === 'apiKeySecurityScheme') {
    return {
      apiKeySecurityScheme: omitUndefined({
        description: optionalString(
          wrapper.description,
          `${path}.${wrapperKey}.description`,
          issues
        ),
        location: asEnum(
          wrapper.location,
          ['query', 'header', 'cookie'] as const,
          `${path}.${wrapperKey}.location`,
          issues
        ),
        name: asNonEmptyString(wrapper.name, `${path}.${wrapperKey}.name`, issues),
      }) as {
        description?: string;
        location: 'query' | 'header' | 'cookie';
        name: string;
      },
    };
  }
  if (wrapperKey === 'httpAuthSecurityScheme') {
    return {
      httpAuthSecurityScheme: omitUndefined({
        bearerFormat: optionalString(
          wrapper.bearerFormat,
          `${path}.${wrapperKey}.bearerFormat`,
          issues
        ),
        description: optionalString(
          wrapper.description,
          `${path}.${wrapperKey}.description`,
          issues
        ),
        scheme: asNonEmptyString(wrapper.scheme, `${path}.${wrapperKey}.scheme`, issues),
      }) as { bearerFormat?: string; description?: string; scheme: string },
    };
  }
  if (wrapperKey === 'oauth2SecurityScheme') {
    return {
      oauth2SecurityScheme: omitUndefined({
        description: optionalString(
          wrapper.description,
          `${path}.${wrapperKey}.description`,
          issues
        ),
        flows: asRecord(wrapper.flows, `${path}.${wrapperKey}.flows`, issues),
        oauth2MetadataUrl:
          wrapper.oauth2MetadataUrl === undefined
            ? undefined
            : validatePublicHttpsUrl(
                wrapper.oauth2MetadataUrl,
                `${path}.${wrapperKey}.oauth2MetadataUrl`,
                issues
              ),
      }) as {
        description?: string;
        flows: Record<string, unknown>;
        oauth2MetadataUrl?: string;
      },
    };
  }
  if (wrapperKey === 'openIdConnectSecurityScheme') {
    return {
      openIdConnectSecurityScheme: omitUndefined({
        description: optionalString(
          wrapper.description,
          `${path}.${wrapperKey}.description`,
          issues
        ),
        openIdConnectUrl: validatePublicHttpsUrl(
          wrapper.openIdConnectUrl,
          `${path}.${wrapperKey}.openIdConnectUrl`,
          issues
        ),
      }) as { description?: string; openIdConnectUrl: string },
    };
  }
  const description = optionalString(
    wrapper.description,
    `${path}.${wrapperKey}.description`,
    issues
  );
  return {
    mtlsSecurityScheme: description === undefined ? {} : { description },
  };
}

function validateLegacySecurityScheme(
  record: Record<string, unknown>,
  path: string,
  issues: ValidationIssue[]
): SecurityScheme {
  const type = asEnum(record.type, LEGACY_SECURITY_SCHEME_TYPES, `${path}.type`, issues);
  if (type === 'apiKey') {
    return {
      apiKeySecurityScheme: omitUndefined({
        description: optionalString(record.description, `${path}.description`, issues),
        location: asEnum(record.in, ['query', 'header', 'cookie'] as const, `${path}.in`, issues),
        name: asNonEmptyString(record.name, `${path}.name`, issues),
      }) as {
        description?: string;
        location: 'query' | 'header' | 'cookie';
        name: string;
      },
    };
  }
  if (type === 'http') {
    return {
      httpAuthSecurityScheme: omitUndefined({
        bearerFormat: optionalString(record.bearerFormat, `${path}.bearerFormat`, issues),
        description: optionalString(record.description, `${path}.description`, issues),
        scheme: asNonEmptyString(record.scheme, `${path}.scheme`, issues),
      }) as { bearerFormat?: string; description?: string; scheme: string },
    };
  }
  if (type === 'oauth2') {
    return {
      oauth2SecurityScheme: omitUndefined({
        description: optionalString(record.description, `${path}.description`, issues),
        flows: record.flows === undefined ? {} : asRecord(record.flows, `${path}.flows`, issues),
        oauth2MetadataUrl:
          record.oauth2MetadataUrl === undefined
            ? undefined
            : validatePublicHttpsUrl(record.oauth2MetadataUrl, `${path}.oauth2MetadataUrl`, issues),
      }) as {
        description?: string;
        flows: Record<string, unknown>;
        oauth2MetadataUrl?: string;
      },
    };
  }
  if (type === 'openIdConnect') {
    return {
      openIdConnectSecurityScheme: omitUndefined({
        description: optionalString(record.description, `${path}.description`, issues),
        openIdConnectUrl: validatePublicHttpsUrl(
          record.openIdConnectUrl,
          `${path}.openIdConnectUrl`,
          issues
        ),
      }) as { description?: string; openIdConnectUrl: string },
    };
  }
  const description = optionalString(record.description, `${path}.description`, issues);
  return {
    mtlsSecurityScheme: description === undefined ? {} : { description },
  };
}

function validateCardSecurityRequirements(
  record: Record<string, unknown>,
  path: string,
  issues: ValidationIssue[]
): SecurityRequirement[] | undefined {
  if (record.securityRequirements !== undefined && record.security !== undefined) {
    issues.push({
      path,
      message: 'securityRequirements and legacy security must not both be present',
    });
  }
  if (record.securityRequirements !== undefined) {
    return validateSecurityRequirements(
      record.securityRequirements,
      `${path}.securityRequirements`,
      issues
    );
  }
  if (record.security !== undefined) {
    return validateSecurityRequirements(record.security, `${path}.security`, issues);
  }
  return undefined;
}

function validateSecurityRequirements(
  value: unknown,
  path: string,
  issues: ValidationIssue[]
): SecurityRequirement[] {
  return asArray(value, path, issues).map((item, index) => {
    const itemPath = `${path}[${index}]`;
    const record = asRecord(item, itemPath, issues);
    const schemeMap =
      record.schemes === undefined
        ? record
        : asRecord(record.schemes, `${itemPath}.schemes`, issues);
    const schemes: SecurityRequirement['schemes'] = {};

    for (const [schemeName, scopes] of Object.entries(schemeMap)) {
      if (record.schemes === undefined) {
        schemes[schemeName] = {
          list: asStringArray(scopes, `${itemPath}.${schemeName}`, issues),
        };
        continue;
      }
      const scopeList = asRecord(scopes, `${itemPath}.schemes.${schemeName}`, issues);
      schemes[schemeName] = {
        list: asStringArray(scopeList.list, `${itemPath}.schemes.${schemeName}.list`, issues),
      };
    }
    return { schemes };
  });
}

function validateSignature(
  value: unknown,
  path: string,
  issues: ValidationIssue[]
): AgentCardSignature {
  const record = asRecord(value, path, issues);
  const signature: AgentCardSignature = {
    protected: asNonEmptyString(record.protected, `${path}.protected`, issues),
    signature: asNonEmptyString(record.signature, `${path}.signature`, issues),
  };
  if (record.header !== undefined)
    signature.header = asRecord(record.header, `${path}.header`, issues);
  return signature;
}

function validateLegacyAuthentication(
  value: unknown,
  path: string,
  issues: ValidationIssue[]
): AuthScheme {
  const record = asRecord(value, path, issues);
  const auth: AuthScheme = {
    type: asEnum(
      record.type,
      ['none', 'bearer', 'oauth2', 'apiKey'] as const,
      `${path}.type`,
      issues
    ),
  };
  if (record.verificationUrl !== undefined) {
    auth.verificationUrl = validatePublicHttpsUrl(
      record.verificationUrl,
      `${path}.verificationUrl`,
      issues
    );
  }
  return auth;
}

function validatePublicHttpsUrl(value: unknown, path: string, issues: ValidationIssue[]): string {
  const raw = asNonEmptyString(value, path, issues);
  try {
    const safe = normalizeHttpUrl(raw, {
      allowLocalhost: false,
      allowPrivateNetwork: false,
      label: path,
    });
    const parsed = new URL(safe);
    if (parsed.protocol !== 'https:') {
      issues.push({ path, message: 'must use HTTPS' });
    }
    return safe;
  } catch (error) {
    issues.push({ path, message: error instanceof Error ? error.message : String(error) });
    return raw;
  }
}

function asRecord(
  value: unknown,
  path: string,
  issues: ValidationIssue[]
): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    issues.push({ path, message: 'expected object' });
    return {};
  }
  return value as Record<string, unknown>;
}

function asArray(value: unknown, path: string, issues: ValidationIssue[]): unknown[] {
  if (!Array.isArray(value)) {
    issues.push({ path, message: 'expected array' });
    return [];
  }
  return value;
}

function asNonEmptyString(value: unknown, path: string, issues: ValidationIssue[]): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    issues.push({ path, message: 'expected non-empty string' });
    return '';
  }
  return value;
}

function optionalString(
  value: unknown,
  path: string,
  issues: ValidationIssue[]
): string | undefined {
  if (value === undefined) return undefined;
  return asNonEmptyString(value, path, issues);
}

function asStringArray(value: unknown, path: string, issues: ValidationIssue[]): string[] {
  return asArray(value, path, issues).map((item, index) =>
    asNonEmptyString(item, `${path}[${index}]`, issues)
  );
}

function asBoolean(value: unknown, path: string, issues: ValidationIssue[]): boolean {
  if (typeof value !== 'boolean') {
    issues.push({ path, message: 'expected boolean' });
    return false;
  }
  return value;
}

function asEnum<T extends string>(
  value: unknown,
  allowed: readonly T[],
  path: string,
  issues: ValidationIssue[]
): T {
  if (typeof value !== 'string' || !allowed.includes(value as T)) {
    issues.push({ path, message: `expected one of ${allowed.join(', ')}` });
    return allowed[0];
  }
  return value as T;
}

function rejectSensitiveKeys(value: unknown, path: string, issues: ValidationIssue[]): void {
  if (typeof value !== 'object' || value === null) return;
  if (Array.isArray(value)) {
    value.forEach((item, index) => rejectSensitiveKeys(item, `${path}[${index}]`, issues));
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    if (
      SECRET_KEY_PATTERN.test(key) &&
      key !== 'securitySchemes' &&
      key !== 'securityRequirements'
    ) {
      issues.push({
        path: `${path}.${key}`,
        message: 'agent cards must not include credential material',
      });
    }
    rejectSensitiveKeys(child, `${path}.${key}`, issues);
  }
}

function throwIfIssues(issues: ValidationIssue[]): void {
  if (issues.length > 0) throw new AgentCardValidationError(issues);
}

function omitUndefined<T extends Record<string, unknown>>(value: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => item !== undefined)
  ) as Partial<T>;
}
