import * as vscode from 'vscode';
import { readConfig } from '../../config';
import { VIEW_ITEM_CONTEXT } from '../../constants';
import { HealthClient } from './HealthClient';
import type { McpServer, DashboardData } from './types';
import { Logger } from '../../utils/logger';
import { createHealthDetailWebview } from './HealthWebviewPanel';

class McpServerItem extends vscode.TreeItem {
  constructor(public readonly server: McpServer) {
    super(server.name, vscode.TreeItemCollapsibleState.None);

    const iconMap = {
      up: new vscode.ThemeIcon('pulse', new vscode.ThemeColor('charts.green')),
      down: new vscode.ThemeIcon('error', new vscode.ThemeColor('charts.red')),
      degraded: new vscode.ThemeIcon('warning', new vscode.ThemeColor('charts.yellow')),
    };
    this.iconPath = iconMap[server.status] ?? iconMap.degraded;

    this.description = `${server.latencyMs}ms`;
    this.tooltip = new vscode.MarkdownString(
      `**${server.name}**\n\n` +
        `Status: ${server.status}\n` +
        `URL: ${server.url}\n` +
        `Uptime: ${server.uptime.toFixed(1)}%\n` +
        `Latency: ${server.latencyMs}ms avg\n` +
        `Last check: ${server.lastCheck}`
    );
    this.contextValue = VIEW_ITEM_CONTEXT.MCP_SERVER;
  }

  get serverName(): string {
    return this.server.name;
  }
}

export class HealthProvider implements vscode.TreeDataProvider<McpServerItem>, vscode.Disposable {
  private _onDidChangeTreeData = new vscode.EventEmitter<McpServerItem | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private client!: HealthClient;
  private servers: McpServer[] = [];
  private pollingTimer: ReturnType<typeof setInterval> | undefined;
  private logger: Logger;

  constructor(private context: vscode.ExtensionContext) {
    this.logger = new Logger('Orbit:Health');
    this.rebuildClient();
    this.startPolling();
  }

  private rebuildClient(): void {
    const config = readConfig();
    this.client = new HealthClient(config.health.endpoint, config.health.token);
  }

  private startPolling(): void {
    this.stopPolling();
    const config = readConfig();
    if (config.health.enabled) {
      this.poll();
      this.pollingTimer = setInterval(
        () => this.poll(),
        config.health.pollingIntervalSeconds * 1000
      );
    }
  }

  private stopPolling(): void {
    if (this.pollingTimer !== undefined) {
      clearInterval(this.pollingTimer);
      this.pollingTimer = undefined;
    }
  }

  private async poll(): Promise<void> {
    try {
      this.servers = await this.client.listServers();
      this.refresh();
    } catch (error) {
      this.logger.warn(
        `Health poll failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  getClient(): HealthClient {
    return this.client;
  }

  getDashboard(): Promise<DashboardData> {
    return this.client.getDashboard();
  }

  registerServer(name: string, url: string): Promise<void> {
    return this.client.registerServer(name, url);
  }

  unregisterServer(name: string): Promise<void> {
    return this.client.unregisterServer(name);
  }

  checkAll(): Promise<void> {
    return this.client.checkAll();
  }

  openDetailWebview(serverName: string): void {
    const server = this.servers.find((s) => s.name === serverName);
    if (server) {
      createHealthDetailWebview(this.context, server);
    }
  }

  refresh(): void {
    this._onDidChangeTreeData.fire(undefined);
  }

  getTreeItem(element: McpServerItem): vscode.TreeItem {
    return element;
  }

  getChildren(): McpServerItem[] {
    return this.servers.map((s) => new McpServerItem(s));
  }

  onConfigChanged(): void {
    this.rebuildClient();
    this.startPolling();
  }

  dispose(): void {
    this.stopPolling();
  }
}
