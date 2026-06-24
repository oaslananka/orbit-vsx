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

export type SecurityRequirement = Record<string, string[]>;

export type SecurityScheme =
  | ApiKeySecurityScheme
  | HttpAuthSecurityScheme
  | OAuth2SecurityScheme
  | OpenIdConnectSecurityScheme
  | MtlsSecurityScheme;

export interface ApiKeySecurityScheme {
  type: 'apiKey';
  name: string;
  in: 'query' | 'header' | 'cookie';
  description?: string;
}

export interface HttpAuthSecurityScheme {
  type: 'http';
  scheme: string;
  bearerFormat?: string;
  description?: string;
}

export interface OAuth2SecurityScheme {
  type: 'oauth2';
  description?: string;
  flows?: Record<string, unknown>;
}

export interface OpenIdConnectSecurityScheme {
  type: 'openIdConnect';
  openIdConnectUrl: string;
  description?: string;
}

export interface MtlsSecurityScheme {
  type: 'mutualTLS';
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
