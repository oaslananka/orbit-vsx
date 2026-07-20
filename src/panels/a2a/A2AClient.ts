import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { getJson } from '../../utils/http';
import { fetchPublicJson } from '../../utils/publicJsonFetch';
import { joinUrl, normalizeHttpUrl } from '../../utils/urlSafety';
import {
  resolveAgentCardDiscoveryUrl,
  validateAgentCardPayload,
  validateAgentCardText,
  validateAgentRegistryEntryPayload,
  validateAgentRegistryPayload,
} from './agentCardValidation';
import { AgentCardTrustVerifier } from './agentCardTrust';
import { AGENT_CARD_MAX_JSON_BYTES } from './constants';
import type {
  AgentCard,
  AgentCardDocumentInspection,
  AgentCardInspection,
  AgentCardTrustResult,
  AgentRegistryEntry,
  ValidationResult,
} from './types';

const execFileAsync = promisify(execFile);
type DiscoveryJsonFetcher = (url: string) => Promise<unknown>;
const defaultDiscoveryJsonFetcher: DiscoveryJsonFetcher = (url) =>
  fetchPublicJson(url, { maxBytes: AGENT_CARD_MAX_JSON_BYTES });

export class A2AClient {
  constructor(
    private registryUrl: string,
    private cliPath: string,
    private readonly discoveryJsonFetcher: DiscoveryJsonFetcher = defaultDiscoveryJsonFetcher,
    private readonly trustVerifier = new AgentCardTrustVerifier()
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
    const entries = validateAgentRegistryPayload(payload);
    const rawEntries = Array.isArray(payload) ? payload : [];
    return Promise.all(
      entries.map(async (entry, index) => ({
        ...entry,
        trust: await this.trustVerifier.verify(readRawRegistryCard(rawEntries[index], entry.card)),
      }))
    );
  }

  async getAgent(name: string): Promise<AgentRegistryEntry> {
    const payload = await getJson<unknown>(
      joinUrl(this.registryUrl, `/agents/${encodeURIComponent(name)}`),
      undefined,
      10000
    );
    const entry = validateAgentRegistryEntryPayload(payload);
    return {
      ...entry,
      trust: await this.trustVerifier.verify(readRawRegistryCard(payload, entry.card)),
    };
  }

  async inspectAgentCard(url: string): Promise<AgentCardInspection> {
    const safeUrl = resolveAgentCardDiscoveryUrl(url);
    const payload = await this.discoveryJsonFetcher(safeUrl);
    return this.inspectAgentCardPayload(payload, safeUrl);
  }

  async fetchAgentCard(url: string): Promise<AgentCard> {
    return (await this.inspectAgentCard(url)).card;
  }

  async inspectAgentCardPayload(
    payload: unknown,
    sourceUrl?: string
  ): Promise<AgentCardInspection> {
    const card = validateAgentCardPayload(payload);
    const trust = await this.trustVerifier.verify(payload, sourceUrl ? { sourceUrl } : {});
    return {
      card,
      trust,
      validation: { errors: [], valid: true },
    };
  }

  async inspectAgentCardText(text: string): Promise<AgentCardDocumentInspection> {
    const validation = validateAgentCardText(text);
    if (!validation.valid) {
      return {
        trust: schemaInvalidTrust(),
        validation,
      };
    }
    try {
      const payload = JSON.parse(text) as unknown;
      return await this.inspectAgentCardPayload(payload);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        trust: schemaInvalidTrust(),
        validation: { errors: [message], valid: false },
      };
    }
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
      const lines = message.split('\n').filter((line) => line.trim().length > 0);
      return { valid: false, errors: lines };
    }
  }
}

function readRawRegistryCard(value: unknown, fallback: AgentCard): unknown {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return fallback;
  const card = (value as Record<string, unknown>).card;
  return card ?? fallback;
}

function schemaInvalidTrust(): AgentCardTrustResult {
  return {
    reason: 'schema_invalid',
    signatureCount: 0,
    state: 'unverified',
    summary: 'Signature trust was not evaluated because the Agent Card schema is invalid.',
  };
}
