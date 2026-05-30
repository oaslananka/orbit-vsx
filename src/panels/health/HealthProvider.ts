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
    this.id = `mcp-server:${server.name}`;
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

export class HealthProvider
  implements vscode.TreeDataProvider<McpServerItem | vscode.TreeItem>, vscode.Disposable
{
  private _onDidChangeTreeData = new vscode.EventEmitter<
    McpServerItem | vscode.TreeItem | undefined
  >();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private client!: HealthClient;
  private servers: McpServer[] = [];
  private pollingTimer: ReturnType<typeof setInterval> | undefined;
  private logger: Logger;
  private _error: string | undefined;

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
      this._error = undefined;
      this.refresh();
    } catch (error) {
      this._error = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Health poll failed: ${this._error}`);
      this.refresh();
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

  getTreeItem(element: McpServerItem | vscode.TreeItem): vscode.TreeItem {
    return element;
  }

  resolveTreeItem(item: McpServerItem | vscode.TreeItem): vscode.TreeItem {
    if (!(item instanceof McpServerItem)) return item;
    const s = item.server;
    const pipelines = s.pipelineGroups ?? [];
    const pipelineInfo =
      pipelines.length > 0
        ? `\n\nPipelines:\n${pipelines.map((p) => `  • ${p.name}: ${p.status} (${p.lastRun})`).join('\n')}`
        : '';
    const md = new vscode.MarkdownString(
      `**${s.name}**  \n` +
        `Status: \`${s.status}\`  \n` +
        `URL: \`${s.url}\`  \n` +
        `Uptime: ${s.uptime.toFixed(1)}%  \n` +
        `Latency: ${s.latencyMs}ms avg  \n` +
        `Last check: ${s.lastCheck}` +
        pipelineInfo,
      true
    );
    md.isTrusted = true;
    item.tooltip = md;
    return item;
  }

  getChildren(): (McpServerItem | vscode.TreeItem)[] {
    if (this._error) {
      const errItem = new vscode.TreeItem(
        '⚠ Connection error',
        vscode.TreeItemCollapsibleState.None
      );
      errItem.description = this._error;
      errItem.tooltip = this._error;
      errItem.iconPath = new vscode.ThemeIcon('error', new vscode.ThemeColor('charts.red'));
      return [errItem];
    }
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
