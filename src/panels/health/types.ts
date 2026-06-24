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
