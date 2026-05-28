import { execFileSync } from 'node:child_process';
import { getJson } from '../../utils/http';
import type { AgentCard, AgentRegistryEntry, ValidationResult } from './types';

export class A2AClient {
  constructor(
    private registryUrl: string,
    private cliPath: string
  ) {}

  getCliPath(): string {
    return this.cliPath;
  }

  async listAgents(): Promise<AgentRegistryEntry[]> {
    return getJson<AgentRegistryEntry[]>(`${this.registryUrl}/agents`, undefined, 10000);
  }

  async getAgent(name: string): Promise<AgentRegistryEntry> {
    return getJson<AgentRegistryEntry>(
      `${this.registryUrl}/agents/${encodeURIComponent(name)}`,
      undefined,
      10000
    );
  }

  async fetchAgentCard(url: string): Promise<AgentCard> {
    return getJson<AgentCard>(url, undefined, 15000);
  }

  validateAgentCard(filePath: string): ValidationResult {
    try {
      execFileSync(this.cliPath, ['validate', filePath], {
        encoding: 'utf-8',
        timeout: 30000,
      });
      return { valid: true, errors: [] };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const lines = message.split('\n').filter((l) => l.trim().length > 0);
      return { valid: false, errors: lines };
    }
  }
}
