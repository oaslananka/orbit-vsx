import { getJson, postJson } from '../../utils/http';
import type { DashboardData, McpServer, McpJsonRpcRequest, McpJsonRpcResponse } from './types';

export class HealthClient {
  constructor(
    private endpoint: string,
    private token: string
  ) {}

  private get headers(): Record<string, string> {
    if (!this.token) return {};
    return { Authorization: `Bearer ${this.token}` };
  }

  async checkHealth(): Promise<boolean> {
    try {
      await getJson(`${this.endpoint}/health`, this.headers, 5000);
      return true;
    } catch {
      return false;
    }
  }

  private async mcpCall<T>(method: string, params?: Record<string, unknown>): Promise<T> {
    const request: McpJsonRpcRequest = {
      jsonrpc: '2.0',
      method: 'tools/call',
      params: { name: method, arguments: params ?? {} },
      id: Date.now(),
    };
    const response = await postJson<McpJsonRpcResponse<T>>(
      `${this.endpoint}/mcp`,
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

  async listServers(): Promise<McpServer[]> {
    const result = await this.mcpCall<{ servers: McpServer[] }>('list_servers');
    return result.servers;
  }

  async registerServer(name: string, url: string): Promise<void> {
    await this.mcpCall('register_server', { name, url });
  }

  async unregisterServer(name: string): Promise<void> {
    await this.mcpCall('unregister_server', { name });
  }

  async getDashboard(): Promise<DashboardData> {
    return this.mcpCall<DashboardData>('get_dashboard');
  }

  async checkAll(): Promise<void> {
    await this.mcpCall('check_all');
  }

  async getUptime(name: string): Promise<number> {
    const result = await this.mcpCall<{ uptime: number }>('get_uptime', { name });
    return result.uptime;
  }
}
