export interface AgentCard {
  name: string;
  description: string;
  version: string;
  supportedInterfaces: AgentInterface[];
  capabilities: AgentCapabilities;
  defaultInputModes: string[];
  defaultOutputModes: string[];
  skills: AgentSkill[];
  provider?: AgentProvider;
  documentationUrl?: string;
  iconUrl?: string;
  securitySchemes?: Record<string, SecurityScheme>;
  securityRequirements?: SecurityRequirement[];
  signatures?: AgentCardSignature[];
  /** @deprecated Legacy pre-1.0 card URL kept for older registries. */
  url?: string;
  /** @deprecated Legacy auth summary kept for older webview payloads. */
  authentication?: AuthScheme;
}

export interface AgentProvider {
  organization: string;
  url?: string;
}

export interface AgentInterface {
  url: string;
  protocolBinding: string;
  protocolVersion: string;
  tenant?: string;
}

export interface AgentCapabilities {
  streaming?: boolean;
  pushNotifications?: boolean;
  stateTransitionHistory?: boolean;
  extendedAgentCard?: boolean;
  extensions?: AgentExtension[];
}

export interface AgentExtension {
  uri: string;
  description?: string;
  required?: boolean;
}

export interface AgentSkill {
  id: string;
  name: string;
  description: string;
  tags: string[];
  examples?: string[];
  inputModes?: string[];
  outputModes?: string[];
  securityRequirements?: SecurityRequirement[];
}

export interface SecurityRequirement {
  schemes: Record<string, SecurityScopeList>;
}

export interface SecurityScopeList {
  list: string[];
}

export type SecurityScheme =
  | { apiKeySecurityScheme: ApiKeySecurityScheme }
  | { httpAuthSecurityScheme: HttpAuthSecurityScheme }
  | { oauth2SecurityScheme: OAuth2SecurityScheme }
  | { openIdConnectSecurityScheme: OpenIdConnectSecurityScheme }
  | { mtlsSecurityScheme: MutualTlsSecurityScheme };

export interface ApiKeySecurityScheme {
  location: 'query' | 'header' | 'cookie';
  name: string;
  description?: string;
}

export interface HttpAuthSecurityScheme {
  scheme: string;
  bearerFormat?: string;
  description?: string;
}

export interface OAuth2SecurityScheme {
  flows: Record<string, unknown>;
  oauth2MetadataUrl?: string;
  description?: string;
}

export interface OpenIdConnectSecurityScheme {
  openIdConnectUrl: string;
  description?: string;
}

export interface MutualTlsSecurityScheme {
  description?: string;
}

export interface AgentCardSignature {
  protected: string;
  signature: string;
  header?: Record<string, unknown>;
}

export interface AuthScheme {
  type: 'none' | 'bearer' | 'oauth2' | 'apiKey';
  verificationUrl?: string;
}

export interface AgentRegistryEntry {
  card: AgentCard;
  online: boolean;
  lastSeen: string;
  validation: ValidationResult;
}

export interface LocalAgentCard {
  filePath: string;
  validation: ValidationResult;
}

export interface ValidationIssue {
  path: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  issues?: ValidationIssue[];
}
