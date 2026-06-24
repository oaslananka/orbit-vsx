import { getJson } from '../../utils/http';
import {
  McpJsonRpcClient,
  asArray,
  asEnum,
  asNumber,
  asRecord,
  asString,
} from '../../utils/mcpJsonRpc';
import { joinUrl, normalizeHttpUrl } from '../../utils/urlSafety';
import type { DashboardData, McpServer, PipelineGroup } from './types';

const SERVER_STATUS = ['up', 'down', 'degraded'] as const;
const PIPELINE_STATUS = ['passed', 'failed', 'running', 'unknown'] as const;

export class HealthClient {
  private readonly mcp: McpJsonRpcClient;

  constructor(
    private endpoint: string,
    private token: string
  ) {
    this.endpoint = normalizeHttpUrl(endpoint, {
      allowLocalhost: true,
      allowPrivateNetwork: true,
      label: 'Health endpoint',
    });
    this.mcp = new McpJsonRpcClient({ endpoint: this.endpoint, headers: () => this.headers });
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

  async listServers(): Promise<McpServer[]> {
    const result = await this.mcp.toolCall('list_servers', {}, validateListServersResult);
    return result.servers;
  }

  async registerServer(name: string, url: string): Promise<void> {
    const safeUrl = normalizeHttpUrl(url, {
      allowLocalhost: true,
      allowPrivateNetwork: true,
      label: 'MCP server URL',
    });
    await this.mcp.toolCall('register_server', { name, url: safeUrl }, validateVoidResult);
  }

  async unregisterServer(name: string): Promise<void> {
    await this.mcp.toolCall('unregister_server', { name }, validateVoidResult);
  }

  async getDashboard(): Promise<DashboardData> {
    return this.mcp.toolCall('get_dashboard', {}, validateDashboardData);
  }

  async checkAll(): Promise<void> {
    await this.mcp.toolCall('check_all', {}, validateVoidResult);
  }

  async getUptime(name: string): Promise<number> {
    const result = await this.mcp.toolCall('get_uptime', { name }, validateUptimeResult);
    return result.uptime;
  }
}

function validateVoidResult(value: unknown, context: string): void {
  if (value === null) return;
  asRecord(value, context);
}

function validateListServersResult(value: unknown, context: string): { servers: McpServer[] } {
  const record = asRecord(value, context);
  return {
    servers: asArray(record.servers, `${context}.servers`).map((item, index) =>
      validateMcpServer(item, `${context}.servers[${index}]`)
    ),
  };
}

function validateUptimeResult(value: unknown, context: string): { uptime: number } {
  const record = asRecord(value, context);
  return { uptime: asNumber(record.uptime, `${context}.uptime`) };
}

function validateDashboardData(value: unknown, context: string): DashboardData {
  const record = asRecord(value, context);
  const summary = asRecord(record.summary, `${context}.summary`);
  return {
    servers: asArray(record.servers, `${context}.servers`).map((item, index) =>
      validateMcpServer(item, `${context}.servers[${index}]`)
    ),
    summary: {
      degraded: asNumber(summary.degraded, `${context}.summary.degraded`),
      down: asNumber(summary.down, `${context}.summary.down`),
      total: asNumber(summary.total, `${context}.summary.total`),
      up: asNumber(summary.up, `${context}.summary.up`),
    },
  };
}

function validateMcpServer(value: unknown, context: string): McpServer {
  const record = asRecord(value, context);
  const server: McpServer = {
    lastCheck: asString(record.lastCheck, `${context}.lastCheck`),
    latencyMs: asNumber(record.latencyMs, `${context}.latencyMs`),
    name: asString(record.name, `${context}.name`),
    status: asEnum(record.status, SERVER_STATUS, `${context}.status`),
    uptime: asNumber(record.uptime, `${context}.uptime`),
    url: asString(record.url, `${context}.url`),
  };

  if (record.pipelineGroups !== undefined) {
    server.pipelineGroups = asArray(record.pipelineGroups, `${context}.pipelineGroups`).map(
      (item, index) => validatePipelineGroup(item, `${context}.pipelineGroups[${index}]`)
    );
  }

  return server;
}

function validatePipelineGroup(value: unknown, context: string): PipelineGroup {
  const record = asRecord(value, context);
  return {
    lastRun: asString(record.lastRun, `${context}.lastRun`),
    name: asString(record.name, `${context}.name`),
    status: asEnum(record.status, PIPELINE_STATUS, `${context}.status`),
  };
}
