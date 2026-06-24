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
