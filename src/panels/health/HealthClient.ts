import { getJson, postJson } from '../../utils/http';
import { joinUrl, normalizeHttpUrl } from '../../utils/urlSafety';
import type { DashboardData, McpServer, McpJsonRpcRequest, McpJsonRpcResponse } from './types';

let nextJsonRpcId = 1;

export class HealthClient {
  constructor(
    private endpoint: string,
    private token: string
  ) {
    this.endpoint = normalizeHttpUrl(endpoint, {
      allowLocalhost: true,
      allowPrivateNetwork: true,
      label: 'Health endpoint',
    });
  }

  private get headers(): Record<string, string> {
    if (!this.token) return {};
    return { Authorization: `Bearer ${this.token}` };
  }

  async checkHealth(): Promise<boolean> {
    try {
      await getJson(joinUrl(this.endpoint, '/health'), this.headers, 5000);
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

  async listServers(): Promise<McpServer[]> {
    const result = await this.mcpCall<{ servers: McpServer[] }>('list_servers');
    return result.servers;
  }

  async registerServer(name: string, url: string): Promise<void> {
    const safeUrl = normalizeHttpUrl(url, {
      allowLocalhost: true,
      allowPrivateNetwork: true,
      label: 'MCP server URL',
    });
    await this.mcpCall('register_server', { name, url: safeUrl });
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
