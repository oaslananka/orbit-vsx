export interface McpServer {
  name: string;
  url: string;
  status: 'up' | 'down' | 'degraded';
  uptime: number;
  latencyMs: number;
  lastCheck: string;
  pipelineGroups?: PipelineGroup[];
}

export interface PipelineGroup {
  name: string;
  status: 'passed' | 'failed' | 'running' | 'unknown';
  lastRun: string;
}

export interface DashboardData {
  servers: McpServer[];
  summary: {
    total: number;
    up: number;
    down: number;
    degraded: number;
  };
}

export interface McpJsonRpcRequest {
  jsonrpc: '2.0';
  method: string;
  params?: Record<string, unknown>;
  id: number;
}

export interface McpJsonRpcResponse<T = unknown> {
  jsonrpc: '2.0';
  result?: T;
  error?: { code: number; message: string };
  id: number;
}
