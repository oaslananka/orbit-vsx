import * as vscode from 'vscode';
import { readConfig } from '../../config';
import { Logger } from '../../utils/logger';
import { isWorkspaceTrusted, WORKSPACE_TRUST_REQUIRED_MESSAGE } from '../../utils/workspaceTrust';
import { HealthClient } from './HealthClient';
import type { DashboardData, McpServer } from './types';

const EMPTY_DASHBOARD: DashboardData = {
  servers: [],
  summary: { degraded: 0, down: 0, total: 0, up: 0 },
};

export interface HealthState {
  dashboard: DashboardData;
  error: string | undefined;
  lastUpdated: string | undefined;
  loading: boolean;
  servers: McpServer[];
}

export class HealthStore implements vscode.Disposable {
  private readonly _onDidChangeState = new vscode.EventEmitter<HealthState>();
  readonly onDidChangeState = this._onDidChangeState.event;

  private client!: HealthClient;
  private pollingTimer: ReturnType<typeof setTimeout> | undefined;
  private pollingGeneration = 0;
  private refreshPromise: Promise<HealthState> | undefined;
  private readonly logger = new Logger('Orbit:HealthStore');
  private state: HealthState = {
    dashboard: EMPTY_DASHBOARD,
    error: undefined,
    lastUpdated: undefined,
    loading: false,
    servers: [],
  };

  constructor() {
    this.rebuildClient();
    this.startPolling();
  }

  getState(): HealthState {
    return this.state;
  }

  getClient(): HealthClient {
    return this.client;
  }

  async registerServer(name: string, url: string): Promise<void> {
    await this.client.registerServer(name, url);
    await this.refresh();
  }

  async unregisterServer(name: string): Promise<void> {
    await this.client.unregisterServer(name);
    await this.refresh();
  }

  async checkAll(): Promise<void> {
    await this.client.checkAll();
    await this.refresh();
  }

  refresh(): Promise<HealthState> {
    if (!this.refreshPromise) {
      this.refreshPromise = this.poll().finally(() => {
        this.refreshPromise = undefined;
      });
    }
    return this.refreshPromise;
  }

  onConfigChanged(): void {
    this.rebuildClient();
    this.startPolling();
    void this.refresh();
  }

  dispose(): void {
    this.stopPolling();
    this._onDidChangeState.dispose();
    this.logger.dispose();
  }

  private rebuildClient(): void {
    const config = readConfig();
    this.client = new HealthClient(config.health.endpoint, config.health.token);
  }

  private startPolling(): void {
    this.stopPolling();
    const config = readConfig();
    if (config.health.enabled) {
      this.schedulePoll(config.health.pollingIntervalSeconds * 1000, this.pollingGeneration);
    }
  }

  private schedulePoll(intervalMs: number, generation: number): void {
    if (generation !== this.pollingGeneration) return;
    this.pollingTimer = setTimeout(() => {
      this.pollingTimer = undefined;
      void this.refresh().finally(() => {
        this.schedulePoll(intervalMs, generation);
      });
    }, intervalMs);
  }

  private stopPolling(): void {
    this.pollingGeneration += 1;
    if (this.pollingTimer !== undefined) {
      clearTimeout(this.pollingTimer);
      this.pollingTimer = undefined;
    }
  }

  private async poll(): Promise<HealthState> {
    this.setState({ loading: true });
    try {
      const config = readConfig();
      if (!isWorkspaceTrusted()) {
        this.setState({
          dashboard: EMPTY_DASHBOARD,
          error: WORKSPACE_TRUST_REQUIRED_MESSAGE,
          lastUpdated: new Date().toISOString(),
          loading: false,
          servers: [],
        });
        return this.state;
      }
      if (!config.health.enabled) {
        this.setState({
          dashboard: EMPTY_DASHBOARD,
          error: undefined,
          lastUpdated: new Date().toISOString(),
          loading: false,
          servers: [],
        });
        return this.state;
      }

      const dashboard = await this.client.getDashboard();
      this.setState({
        dashboard,
        error: undefined,
        lastUpdated: new Date().toISOString(),
        loading: false,
        servers: dashboard.servers,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Health refresh failed: ${message}`);
      this.setState({ error: message, lastUpdated: new Date().toISOString(), loading: false });
    }
    return this.state;
  }

  private setState(patch: Partial<HealthState>): void {
    this.state = { ...this.state, ...patch };
    this._onDidChangeState.fire(this.state);
  }
}
