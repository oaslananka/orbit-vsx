import { postJson } from '../../utils/http';
import { joinUrl, normalizeHttpUrl } from '../../utils/urlSafety';
import type {
  DebugSession,
  SessionSearchResult,
  McpJsonRpcRequest,
  McpJsonRpcResponse,
} from './types';

let nextJsonRpcId = 1;

export class DebugClient {
  constructor(
    private endpoint: string,
    private token: string
  ) {
    this.endpoint = normalizeHttpUrl(endpoint, {
      allowLocalhost: true,
      allowPrivateNetwork: true,
      label: 'Debug endpoint',
    });
  }

  private get headers(): Record<string, string> {
    if (!this.token) return {};
    return { Authorization: `Bearer ${this.token}` };
  }

  private async mcpCall<T>(method: string, params?: Record<string, unknown>): Promise<T> {
    const request: McpJsonRpcRequest = {
      jsonrpc: '2.0',
      method: 'tools/call',
      params: { name: method, arguments: params ?? {} },
      id: nextJsonRpcId++,
    };
    const response = await postJson<McpJsonRpcResponse<T>>(
      joinUrl(this.endpoint, '/mcp'),
      request,
      this.headers
    );
    if (response.error) {
      throw new Error(`MCP error: ${response.error.message}`);
    }
    if (response.result === undefined) {
      throw new Error(`MCP error: response result is undefined for method '${method}'`);
    }
    return response.result;
  }

  async listSessions(): Promise<DebugSession[]> {
    const result = await this.mcpCall<{ sessions: DebugSession[] }>('list_sessions');
    return result.sessions;
  }

  async startDebugSession(title: string): Promise<DebugSession> {
    return this.mcpCall<DebugSession>('start_debug_session', { title });
  }

  async closeSession(id: string): Promise<void> {
    await this.mcpCall('close_session', { id });
  }

  async getSessionContext(id: string): Promise<DebugSession> {
    return this.mcpCall<DebugSession>('get_session_context', { id });
  }

  async searchSessions(query: string): Promise<SessionSearchResult> {
    return this.mcpCall<SessionSearchResult>('search_sessions', { query });
  }

  async findSimilarErrors(errorText: string): Promise<DebugSession[]> {
    const result = await this.mcpCall<{ sessions: DebugSession[] }>('find_similar_errors', {
      errorText,
    });
    return result.sessions;
  }

  async recordCommand(sessionId: string, command: string): Promise<void> {
    await this.mcpCall('record_command', { sessionId, command });
  }

  async addFix(sessionId: string, description: string): Promise<void> {
    await this.mcpCall('add_fix', { sessionId, description });
  }
}
