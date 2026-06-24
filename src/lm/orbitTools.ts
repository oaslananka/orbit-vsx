import * as vscode from 'vscode';
import type { A2AProvider } from '../panels/a2a/A2AProvider';
import { validateAgentCardText } from '../panels/a2a/agentCardValidation';
import type { AgentCard, AgentRegistryEntry, ValidationResult } from '../panels/a2a/types';
import type { DebugProvider } from '../panels/debug/DebugProvider';
import type { DebugSession } from '../panels/debug/types';
import type { HealthProvider } from '../panels/health/HealthProvider';
import type { McpServer } from '../panels/health/types';
import { recordAuditEvent } from '../utils/audit';
import { redactUrl } from '../utils/urlSafety';
import { isWorkspaceTrusted, WORKSPACE_TRUST_REQUIRED_MESSAGE } from '../utils/workspaceTrust';

export const ORBIT_LANGUAGE_MODEL_TOOL_NAMES = {
  GET_MCP_HEALTH: 'orbit_get_mcp_health',
  LIST_MCP_SERVERS: 'orbit_list_mcp_servers',
  SEARCH_DEBUG_SESSIONS: 'orbit_search_debug_sessions',
  GET_DEBUG_SESSION_CONTEXT: 'orbit_get_debug_session_context',
  LIST_A2A_AGENTS: 'orbit_list_a2a_agents',
  VALIDATE_AGENT_CARD: 'orbit_validate_agent_card',
} as const;

interface OrbitToolProviders {
  a2aProvider: A2AProvider;
  debugProvider: DebugProvider;
  healthProvider: HealthProvider;
}

interface LimitInput {
  limit?: number;
}

interface GetMcpHealthInput {
  refresh?: boolean;
}

interface ListMcpServersInput extends LimitInput {
  includePipelines?: boolean;
}

interface SearchDebugSessionsInput extends LimitInput {
  query: string;
}

interface GetDebugSessionContextInput {
  sessionId: string;
}

interface ValidateAgentCardInput {
  cardJson?: string;
  url?: string;
}

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 25;
const MAX_TEXT_LENGTH = 4000;
const MAX_ERROR_TEXT_LENGTH = 1200;
const MAX_COMMANDS = 20;
const MAX_FIX_ATTEMPTS = 20;

export function registerOrbitLanguageModelTools(
  context: vscode.ExtensionContext,
  providers: OrbitToolProviders
): void {
  const registerTool = vscode.lm?.registerTool;
  if (typeof registerTool !== 'function') return;

  const tools: Array<[string, vscode.LanguageModelTool<unknown>]> = [
    [
      ORBIT_LANGUAGE_MODEL_TOOL_NAMES.GET_MCP_HEALTH,
      new GetMcpHealthTool(providers.healthProvider),
    ],
    [
      ORBIT_LANGUAGE_MODEL_TOOL_NAMES.LIST_MCP_SERVERS,
      new ListMcpServersTool(providers.healthProvider),
    ],
    [
      ORBIT_LANGUAGE_MODEL_TOOL_NAMES.SEARCH_DEBUG_SESSIONS,
      new SearchDebugSessionsTool(providers.debugProvider),
    ],
    [
      ORBIT_LANGUAGE_MODEL_TOOL_NAMES.GET_DEBUG_SESSION_CONTEXT,
      new GetDebugSessionContextTool(providers.debugProvider),
    ],
    [ORBIT_LANGUAGE_MODEL_TOOL_NAMES.LIST_A2A_AGENTS, new ListA2AAgentsTool(providers.a2aProvider)],
    [
      ORBIT_LANGUAGE_MODEL_TOOL_NAMES.VALIDATE_AGENT_CARD,
      new ValidateAgentCardTool(providers.a2aProvider),
    ],
  ];

  for (const [name, tool] of tools) {
    context.subscriptions.push(registerTool(name, tool));
  }
}

class GetMcpHealthTool implements vscode.LanguageModelTool<GetMcpHealthInput> {
  constructor(private readonly healthProvider: HealthProvider) {}

  prepareInvocation(): vscode.PreparedToolInvocation {
    return { invocationMessage: 'Reading Orbit MCP health status' };
  }

  async invoke(
    options: vscode.LanguageModelToolInvocationOptions<GetMcpHealthInput>
  ): Promise<vscode.LanguageModelToolResult> {
    assertWorkspaceTrusted();
    recordToolAudit(ORBIT_LANGUAGE_MODEL_TOOL_NAMES.GET_MCP_HEALTH, 'started');
    try {
      const dashboard =
        options.input.refresh === false
          ? this.healthProvider.getState().dashboard
          : await this.healthProvider.getDashboard();
      recordToolAudit(ORBIT_LANGUAGE_MODEL_TOOL_NAMES.GET_MCP_HEALTH, 'success');
      return jsonToolResult({
        summary: dashboard.summary,
        servers: dashboard.servers.map((server) => summarizeMcpServer(server)),
      });
    } catch (error) {
      recordToolAudit(ORBIT_LANGUAGE_MODEL_TOOL_NAMES.GET_MCP_HEALTH, 'failure');
      throw asToolError(error);
    }
  }
}

class ListMcpServersTool implements vscode.LanguageModelTool<ListMcpServersInput> {
  constructor(private readonly healthProvider: HealthProvider) {}

  prepareInvocation(): vscode.PreparedToolInvocation {
    return { invocationMessage: 'Listing Orbit MCP servers' };
  }

  async invoke(
    options: vscode.LanguageModelToolInvocationOptions<ListMcpServersInput>
  ): Promise<vscode.LanguageModelToolResult> {
    assertWorkspaceTrusted();
    const limit = boundedLimit(options.input.limit);
    recordToolAudit(ORBIT_LANGUAGE_MODEL_TOOL_NAMES.LIST_MCP_SERVERS, 'started');
    try {
      const dashboard = await this.healthProvider.getDashboard();
      recordToolAudit(ORBIT_LANGUAGE_MODEL_TOOL_NAMES.LIST_MCP_SERVERS, 'success');
      return jsonToolResult({
        count: dashboard.servers.length,
        servers: dashboard.servers
          .slice(0, limit)
          .map((server) => summarizeMcpServer(server, options.input.includePipelines === true)),
        truncated: dashboard.servers.length > limit,
      });
    } catch (error) {
      recordToolAudit(ORBIT_LANGUAGE_MODEL_TOOL_NAMES.LIST_MCP_SERVERS, 'failure');
      throw asToolError(error);
    }
  }
}

class SearchDebugSessionsTool implements vscode.LanguageModelTool<SearchDebugSessionsInput> {
  constructor(private readonly debugProvider: DebugProvider) {}

  prepareInvocation(
    options: vscode.LanguageModelToolInvocationPrepareOptions<SearchDebugSessionsInput>
  ): vscode.PreparedToolInvocation {
    return {
      invocationMessage: `Searching Orbit debug sessions for "${truncateText(options.input.query, 80)}"`,
    };
  }

  async invoke(
    options: vscode.LanguageModelToolInvocationOptions<SearchDebugSessionsInput>
  ): Promise<vscode.LanguageModelToolResult> {
    assertWorkspaceTrusted();
    const query = nonEmptyString(options.input.query, 'query');
    const limit = boundedLimit(options.input.limit);
    recordToolAudit(ORBIT_LANGUAGE_MODEL_TOOL_NAMES.SEARCH_DEBUG_SESSIONS, 'started');
    try {
      const result = await this.debugProvider.getClient().searchSessions(query);
      recordToolAudit(ORBIT_LANGUAGE_MODEL_TOOL_NAMES.SEARCH_DEBUG_SESSIONS, 'success');
      return jsonToolResult({
        sessions: result.sessions.slice(0, limit).map((session) => summarizeDebugSession(session)),
        total: result.total,
        truncated: result.sessions.length > limit,
      });
    } catch (error) {
      recordToolAudit(ORBIT_LANGUAGE_MODEL_TOOL_NAMES.SEARCH_DEBUG_SESSIONS, 'failure');
      throw asToolError(error);
    }
  }
}

class GetDebugSessionContextTool implements vscode.LanguageModelTool<GetDebugSessionContextInput> {
  constructor(private readonly debugProvider: DebugProvider) {}

  prepareInvocation(
    options: vscode.LanguageModelToolInvocationPrepareOptions<GetDebugSessionContextInput>
  ): vscode.PreparedToolInvocation {
    return {
      invocationMessage: `Reading Orbit debug session ${truncateText(options.input.sessionId, 80)}`,
    };
  }

  async invoke(
    options: vscode.LanguageModelToolInvocationOptions<GetDebugSessionContextInput>
  ): Promise<vscode.LanguageModelToolResult> {
    assertWorkspaceTrusted();
    const sessionId = nonEmptyString(options.input.sessionId, 'sessionId');
    recordToolAudit(
      ORBIT_LANGUAGE_MODEL_TOOL_NAMES.GET_DEBUG_SESSION_CONTEXT,
      'started',
      sessionId
    );
    try {
      const session = await this.debugProvider.getClient().getSessionContext(sessionId);
      recordToolAudit(
        ORBIT_LANGUAGE_MODEL_TOOL_NAMES.GET_DEBUG_SESSION_CONTEXT,
        'success',
        sessionId
      );
      return jsonToolResult({ session: summarizeDebugSession(session, true) });
    } catch (error) {
      recordToolAudit(
        ORBIT_LANGUAGE_MODEL_TOOL_NAMES.GET_DEBUG_SESSION_CONTEXT,
        'failure',
        sessionId
      );
      throw asToolError(error);
    }
  }
}

class ListA2AAgentsTool implements vscode.LanguageModelTool<LimitInput> {
  constructor(private readonly a2aProvider: A2AProvider) {}

  prepareInvocation(): vscode.PreparedToolInvocation {
    return { invocationMessage: 'Listing Orbit A2A agents' };
  }

  async invoke(
    options: vscode.LanguageModelToolInvocationOptions<LimitInput>
  ): Promise<vscode.LanguageModelToolResult> {
    assertWorkspaceTrusted();
    const limit = boundedLimit(options.input.limit);
    recordToolAudit(ORBIT_LANGUAGE_MODEL_TOOL_NAMES.LIST_A2A_AGENTS, 'started');
    try {
      const agents = await this.a2aProvider.getClient().listAgents();
      recordToolAudit(ORBIT_LANGUAGE_MODEL_TOOL_NAMES.LIST_A2A_AGENTS, 'success');
      return jsonToolResult({
        agents: agents.slice(0, limit).map(summarizeAgentRegistryEntry),
        count: agents.length,
        truncated: agents.length > limit,
      });
    } catch (error) {
      recordToolAudit(ORBIT_LANGUAGE_MODEL_TOOL_NAMES.LIST_A2A_AGENTS, 'failure');
      throw asToolError(error);
    }
  }
}

class ValidateAgentCardTool implements vscode.LanguageModelTool<ValidateAgentCardInput> {
  constructor(private readonly a2aProvider: A2AProvider) {}

  prepareInvocation(
    options: vscode.LanguageModelToolInvocationPrepareOptions<ValidateAgentCardInput>
  ): vscode.PreparedToolInvocation {
    return {
      invocationMessage: options.input.url
        ? 'Fetching and validating an A2A Agent Card'
        : 'Validating an A2A Agent Card JSON payload',
    };
  }

  async invoke(
    options: vscode.LanguageModelToolInvocationOptions<ValidateAgentCardInput>
  ): Promise<vscode.LanguageModelToolResult> {
    assertWorkspaceTrusted();
    const hasJson =
      typeof options.input.cardJson === 'string' && options.input.cardJson.trim().length > 0;
    const hasUrl = typeof options.input.url === 'string' && options.input.url.trim().length > 0;
    if (hasJson === hasUrl) {
      throw new Error('Provide exactly one of cardJson or url.');
    }

    recordToolAudit(
      ORBIT_LANGUAGE_MODEL_TOOL_NAMES.VALIDATE_AGENT_CARD,
      'started',
      options.input.url
    );
    try {
      if (hasJson) {
        const validation = validateAgentCardText(options.input.cardJson ?? '');
        recordToolAudit(
          ORBIT_LANGUAGE_MODEL_TOOL_NAMES.VALIDATE_AGENT_CARD,
          validation.valid ? 'success' : 'failure'
        );
        return jsonToolResult({ validation: summarizeValidation(validation) });
      }

      const card = await this.a2aProvider.getClient().fetchAgentCard(options.input.url ?? '');
      recordToolAudit(
        ORBIT_LANGUAGE_MODEL_TOOL_NAMES.VALIDATE_AGENT_CARD,
        'success',
        options.input.url
      );
      return jsonToolResult({
        card: summarizeAgentCard(card),
        validation: { errors: [], valid: true },
      });
    } catch (error) {
      recordToolAudit(
        ORBIT_LANGUAGE_MODEL_TOOL_NAMES.VALIDATE_AGENT_CARD,
        'failure',
        options.input.url
      );
      throw asToolError(error);
    }
  }
}

function assertWorkspaceTrusted(): void {
  if (!isWorkspaceTrusted()) {
    throw new Error(WORKSPACE_TRUST_REQUIRED_MESSAGE);
  }
}

function jsonToolResult(value: unknown): vscode.LanguageModelToolResult {
  return new vscode.LanguageModelToolResult([
    new vscode.LanguageModelTextPart(truncateText(JSON.stringify(value, null, 2), MAX_TEXT_LENGTH)),
  ]);
}

function recordToolAudit(
  tool: string,
  outcome: 'started' | 'success' | 'failure' | 'blocked',
  target?: string
): void {
  const event = { operation: tool, outcome, surface: 'mcp' as const };
  recordAuditEvent(target ? { ...event, target } : event);
}

function summarizeMcpServer(server: McpServer, includePipelines = false): Record<string, unknown> {
  const summary: Record<string, unknown> = {
    lastCheck: server.lastCheck,
    latencyMs: server.latencyMs,
    name: server.name,
    status: server.status,
    uptime: server.uptime,
    url: redactUrl(server.url),
  };
  if (includePipelines && server.pipelineGroups) {
    summary.pipelineGroups = server.pipelineGroups.slice(0, MAX_LIMIT);
  }
  return summary;
}

function summarizeDebugSession(
  session: DebugSession,
  includeDetails = false
): Record<string, unknown> {
  const summary: Record<string, unknown> = {
    createdAt: session.createdAt,
    id: session.id,
    status: session.status,
    tags: session.tags.slice(0, MAX_LIMIT),
    title: session.title,
    updatedAt: session.updatedAt,
  };
  if (session.description)
    summary.description = truncateText(session.description, MAX_ERROR_TEXT_LENGTH);
  if (session.errorText) summary.errorText = truncateText(session.errorText, MAX_ERROR_TEXT_LENGTH);
  if (includeDetails) {
    summary.fixAttempts = session.fixAttempts.slice(0, MAX_FIX_ATTEMPTS).map((fix) => ({
      description: truncateText(fix.description, 500),
      id: fix.id,
      successful: fix.successful,
      timestamp: fix.timestamp,
    }));
    summary.terminalCommands = session.terminalCommands.slice(0, MAX_COMMANDS).map((command) => ({
      command: truncateText(command.command, 500),
      exitCode: command.exitCode,
      timestamp: command.timestamp,
    }));
  }
  return summary;
}

function summarizeAgentRegistryEntry(entry: AgentRegistryEntry): Record<string, unknown> {
  return {
    card: summarizeAgentCard(entry.card),
    lastSeen: entry.lastSeen,
    online: entry.online,
    validation: summarizeValidation(entry.validation),
  };
}

function summarizeAgentCard(card: AgentCard): Record<string, unknown> {
  return {
    capabilities: card.capabilities,
    defaultInputModes: card.defaultInputModes.slice(0, MAX_LIMIT),
    defaultOutputModes: card.defaultOutputModes.slice(0, MAX_LIMIT),
    description: truncateText(card.description, 1000),
    documentationUrl: card.documentationUrl ? redactUrl(card.documentationUrl) : undefined,
    name: card.name,
    provider: card.provider,
    securitySchemes: card.securitySchemes
      ? Object.fromEntries(
          Object.entries(card.securitySchemes).map(([name, scheme]) => [
            name,
            { type: scheme.type },
          ])
        )
      : undefined,
    skills: card.skills.slice(0, MAX_LIMIT).map((skill) => ({
      description: truncateText(skill.description, 500),
      id: skill.id,
      name: skill.name,
      tags: skill.tags.slice(0, MAX_LIMIT),
    })),
    supportedInterfaces: card.supportedInterfaces.slice(0, MAX_LIMIT).map((agentInterface) => ({
      protocolBinding: agentInterface.protocolBinding,
      protocolVersion: agentInterface.protocolVersion,
      url: redactUrl(agentInterface.url),
    })),
    version: card.version,
  };
}

function summarizeValidation(validation: ValidationResult): Record<string, unknown> {
  return {
    errors: validation.errors.slice(0, MAX_LIMIT).map((error) => truncateText(error, 500)),
    valid: validation.valid,
  };
}

function boundedLimit(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return DEFAULT_LIMIT;
  return Math.min(MAX_LIMIT, Math.max(1, Math.floor(value)));
}

function nonEmptyString(value: unknown, fieldName: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${fieldName} must be a non-empty string.`);
  }
  return value.trim();
}

function truncateText(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength)}…[truncated]`;
}

function asToolError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}
