import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { getJson } from '../../utils/http';
import { fetchPublicJson } from '../../utils/publicJsonFetch';
import { AGENT_CARD_MAX_JSON_BYTES } from './constants';
import { joinUrl, normalizeHttpUrl } from '../../utils/urlSafety';
import {
  resolveAgentCardDiscoveryUrl,
  validateAgentCardPayload,
  validateAgentRegistryEntryPayload,
  validateAgentRegistryPayload,
} from './agentCardValidation';
import type { AgentCard, AgentRegistryEntry, ValidationResult } from './types';

const execFileAsync = promisify(execFile);
type DiscoveryJsonFetcher = (url: string) => Promise<unknown>;
const defaultDiscoveryJsonFetcher: DiscoveryJsonFetcher = (url) =>
  fetchPublicJson(url, { maxBytes: AGENT_CARD_MAX_JSON_BYTES });

export class A2AClient {
  constructor(
    private registryUrl: string,
    private cliPath: string,
    private readonly discoveryJsonFetcher: DiscoveryJsonFetcher = defaultDiscoveryJsonFetcher
  ) {
    this.registryUrl = normalizeHttpUrl(registryUrl, {
      allowLocalhost: true,
      allowPrivateNetwork: true,
      label: 'A2A registry URL',
    });
  }

  getCliPath(): string {
    return this.cliPath;
  }

  getAgentCardDiscoveryUrl(input: string): string {
    return resolveAgentCardDiscoveryUrl(input);
  }

  async listAgents(): Promise<AgentRegistryEntry[]> {
    const payload = await getJson<unknown>(joinUrl(this.registryUrl, '/agents'), undefined, 10000);
    return validateAgentRegistryPayload(payload);
  }

  async getAgent(name: string): Promise<AgentRegistryEntry> {
    const payload = await getJson<unknown>(
      joinUrl(this.registryUrl, `/agents/${encodeURIComponent(name)}`),
      undefined,
      10000
    );
    return validateAgentRegistryEntryPayload(payload);
  }

  async fetchAgentCard(url: string): Promise<AgentCard> {
    const safeUrl = resolveAgentCardDiscoveryUrl(url);
    const payload = await this.discoveryJsonFetcher(safeUrl);
    return validateAgentCardPayload(payload);
  }

  async validateAgentCard(filePath: string, cwd?: string): Promise<ValidationResult> {
    try {
      await execFileAsync(this.cliPath, ['validate', filePath], {
        cwd,
        timeout: 30000,
        encoding: 'utf-8',
      });
      return { valid: true, errors: [] };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const lines = message.split('\n').filter((l) => l.trim().length > 0);
      return { valid: false, errors: lines };
    }
  }
}
