export interface AgentCard {
  name: string;
  description: string;
  version: string;
  url?: string;
  skills: AgentSkill[];
  authentication?: AuthScheme;
}

export interface AgentSkill {
  id: string;
  name: string;
  description: string;
}

export interface AuthScheme {
  type: 'none' | 'bearer' | 'oauth2' | 'apiKey';
  verificationUrl?: string;
}

export interface AgentRegistryEntry {
  card: AgentCard;
  online: boolean;
  lastSeen: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export interface McpJsonRpcRequest {
  jsonrpc: '2.0';
  method: string;
  params?: Record<string, unknown>;
  id: number;
}

export interface McpJsonRpcResponse<T = unknown> {
  jsonrpc: '2.0';
  result?: T;
  error?: { code: number; message: string };
  id: number;
}
