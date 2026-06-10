import * as vscode from 'vscode';
import { readConfig } from '../../config';
import { COMMAND_IDS, ORBIT_VIEW_CONTAINER_COMMAND, VIEW_ITEM_CONTEXT } from '../../constants';
import { HealthClient } from './HealthClient';
import type { McpServer, DashboardData } from './types';
import { Logger } from '../../utils/logger';
import { createHealthDetailWebview } from './HealthWebviewPanel';
import { createTreeEmptyState } from '../../utils/treeEmptyState';

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
  private pollingTimer: ReturnType<typeof setTimeout> | undefined;
  private pollingGeneration = 0;
  private refreshPromise: Promise<void> | undefined;
  private logger: Logger;
  private _error: string | undefined;
  private _loading = false;
  private previousStatuses = new Map<string, string>();

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

  private async poll(): Promise<void> {
    this._loading = true;
    this.fireTreeDataChanged();
    try {
      const config = readConfig();
      if (!config.health.enabled) {
        this.servers = [];
        this.previousStatuses.clear();
        this._error = undefined;
        return;
      }
      const servers = await this.client.listServers();

      if (config.health.alertOnDown || config.health.alertOnRecover) {
        for (const server of servers) {
          const prev = this.previousStatuses.get(server.name);
          if (config.health.alertOnDown && prev === 'up' && server.status === 'down') {
            void vscode.window
              .showWarningMessage(
                `$(error) ${server.name} is DOWN`,
                'Open Health Monitor',
                'Dismiss'
              )
              .then((selection) => {
                if (selection === 'Open Health Monitor') {
                  void vscode.commands.executeCommand(ORBIT_VIEW_CONTAINER_COMMAND);
                }
              });
          }
          if (config.health.alertOnRecover && prev === 'down' && server.status === 'up') {
            void vscode.window.showInformationMessage(`$(check) ${server.name} is back UP`);
          }
          this.previousStatuses.set(server.name, server.status);
        }
      } else {
        for (const server of servers) {
          this.previousStatuses.set(server.name, server.status);
        }
      }

      this.servers = servers;
      const serverNames = new Set(servers.map((server) => server.name));
      for (const name of this.previousStatuses.keys()) {
        if (!serverNames.has(name)) this.previousStatuses.delete(name);
      }
      this._error = undefined;
    } catch (error) {
      this._error = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Health poll failed: ${this._error}`);
    } finally {
      this._loading = false;
      this.fireTreeDataChanged();
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

  refresh(): Promise<void> {
    if (!this.refreshPromise) {
      this.refreshPromise = this.poll().finally(() => {
        this.refreshPromise = undefined;
      });
    }
    return this.refreshPromise;
  }

  private fireTreeDataChanged(): void {
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
    item.tooltip = md;
    return item;
  }

  getChildren(): (McpServerItem | vscode.TreeItem)[] {
    if (this._loading) {
      const loadingItem = new vscode.TreeItem('Loading…', vscode.TreeItemCollapsibleState.None);
      loadingItem.iconPath = new vscode.ThemeIcon('loading~spin');
      return [loadingItem];
    }
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
    if (this.servers.length === 0) {
      return createTreeEmptyState({
        icon: 'pulse',
        title: 'No servers connected',
        description: 'Add a health-monitor-mcp endpoint to start monitoring.',
        actionLabel: 'Add Server',
        actionCommand: COMMAND_IDS.HEALTH_ADD_SERVER,
      });
    }
    return this.servers.map((s) => new McpServerItem(s));
  }

  getCount(): number {
    return this.servers.length;
  }

  onConfigChanged(): void {
    this.rebuildClient();
    this.startPolling();
    void this.refresh();
  }

  dispose(): void {
    this.stopPolling();
    this._onDidChangeTreeData.dispose();
    this.logger.dispose();
  }
}
