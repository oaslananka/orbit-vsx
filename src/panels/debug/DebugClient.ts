import {
  McpJsonRpcClient,
  asArray,
  asBoolean,
  asEnum,
  asNumber,
  asRecord,
  asString,
  asStringArray,
} from '../../utils/mcpJsonRpc';
import { normalizeHttpUrl } from '../../utils/urlSafety';
import type { DebugSession, FixAttempt, SessionSearchResult, TerminalCommand } from './types';

const DEBUG_SESSION_STATUS = ['open', 'resolved', 'abandoned'] as const;

export class DebugClient {
  private readonly mcp: McpJsonRpcClient;

  constructor(
    private endpoint: string,
    private token: string
  ) {
    this.endpoint = normalizeHttpUrl(endpoint, {
      allowLocalhost: true,
      allowPrivateNetwork: true,
      label: 'Debug endpoint',
    });
    this.mcp = new McpJsonRpcClient({ endpoint: this.endpoint, headers: () => this.headers });
  }

  private get headers(): Record<string, string> {
    if (!this.token) return {};
    return { Authorization: `Bearer ${this.token}` };
  }

  async listSessions(): Promise<DebugSession[]> {
    const result = await this.mcp.toolCall('list_sessions', {}, validateSessionListResult);
    return result.sessions;
  }

  async startDebugSession(title: string): Promise<DebugSession> {
    return this.mcp.toolCall('start_debug_session', { title }, validateDebugSession);
  }

  async closeSession(id: string): Promise<void> {
    await this.mcp.toolCall('close_session', { id }, validateVoidResult);
  }

  async getSessionContext(id: string): Promise<DebugSession> {
    return this.mcp.toolCall('get_session_context', { id }, validateDebugSession);
  }

  async searchSessions(query: string): Promise<SessionSearchResult> {
    return this.mcp.toolCall('search_sessions', { query }, validateSessionSearchResult);
  }

  async findSimilarErrors(errorText: string): Promise<DebugSession[]> {
    const result = await this.mcp.toolCall(
      'find_similar_errors',
      { errorText },
      validateSessionListResult
    );
    return result.sessions;
  }

  async recordCommand(sessionId: string, command: string): Promise<void> {
    await this.mcp.toolCall('record_command', { sessionId, command }, validateVoidResult);
  }

  async addFix(sessionId: string, description: string): Promise<void> {
    await this.mcp.toolCall('add_fix', { sessionId, description }, validateVoidResult);
  }
}

function validateVoidResult(value: unknown, context: string): void {
  if (value === null) return;
  asRecord(value, context);
}

function validateSessionListResult(value: unknown, context: string): { sessions: DebugSession[] } {
  const record = asRecord(value, context);
  return {
    sessions: asArray(record.sessions, `${context}.sessions`).map((item, index) =>
      validateDebugSession(item, `${context}.sessions[${index}]`)
    ),
  };
}

function validateSessionSearchResult(value: unknown, context: string): SessionSearchResult {
  const record = asRecord(value, context);
  return {
    sessions: asArray(record.sessions, `${context}.sessions`).map((item, index) =>
      validateDebugSession(item, `${context}.sessions[${index}]`)
    ),
    total: asNumber(record.total, `${context}.total`),
  };
}

function validateDebugSession(value: unknown, context: string): DebugSession {
  const record = asRecord(value, context);
  const session: DebugSession = {
    createdAt: asString(record.createdAt, `${context}.createdAt`),
    fixAttempts: asArray(record.fixAttempts, `${context}.fixAttempts`).map((item, index) =>
      validateFixAttempt(item, `${context}.fixAttempts[${index}]`)
    ),
    id: asString(record.id, `${context}.id`),
    status: asEnum(record.status, DEBUG_SESSION_STATUS, `${context}.status`),
    tags: asStringArray(record.tags, `${context}.tags`),
    terminalCommands: asArray(record.terminalCommands, `${context}.terminalCommands`).map(
      (item, index) => validateTerminalCommand(item, `${context}.terminalCommands[${index}]`)
    ),
    title: asString(record.title, `${context}.title`),
    updatedAt: asString(record.updatedAt, `${context}.updatedAt`),
  };

  if (record.description !== undefined) {
    session.description = asString(record.description, `${context}.description`);
  }
  if (record.errorText !== undefined) {
    session.errorText = asString(record.errorText, `${context}.errorText`);
  }

  return session;
}

function validateFixAttempt(value: unknown, context: string): FixAttempt {
  const record = asRecord(value, context);
  return {
    description: asString(record.description, `${context}.description`),
    id: asString(record.id, `${context}.id`),
    successful: asBoolean(record.successful, context + '.successful'),
    timestamp: asString(record.timestamp, `${context}.timestamp`),
  };
}

function validateTerminalCommand(value: unknown, context: string): TerminalCommand {
  const record = asRecord(value, context);
  const command: TerminalCommand = {
    command: asString(record.command, `${context}.command`),
    timestamp: asString(record.timestamp, `${context}.timestamp`),
  };
  if (record.exitCode !== undefined) {
    command.exitCode = asNumber(record.exitCode, `${context}.exitCode`);
  }
  return command;
}
