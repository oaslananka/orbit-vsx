import * as vscode from 'vscode';
import { readConfig } from '../../config';
import { COMMAND_IDS, ORBIT_VIEW_CONTAINER_COMMAND, VIEW_ITEM_CONTEXT } from '../../constants';
import { createTreeEmptyState } from '../../utils/treeEmptyState';
import { createHealthDetailWebview } from './HealthWebviewPanel';
import { HealthStore, type HealthState } from './HealthStore';
import type { DashboardData, McpServer } from './types';

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
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<
    McpServerItem | vscode.TreeItem | undefined
  >();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private readonly store: HealthStore;
  private readonly storeSubscription: vscode.Disposable;
  private readonly ownsStore: boolean;
  private previousStatuses = new Map<string, string>();

  constructor(
    private context: vscode.ExtensionContext,
    store?: HealthStore
  ) {
    this.store = store ?? new HealthStore();
    this.ownsStore = store === undefined;
    this.storeSubscription = this.store.onDidChangeState((state) =>
      this.onStoreStateChanged(state)
    );
  }

  getState(): HealthState {
    return this.store.getState();
  }

  getClient(): ReturnType<HealthStore['getClient']> {
    return this.store.getClient();
  }

  async getDashboard(): Promise<DashboardData> {
    const state = this.store.getState();
    if (!state.loading && state.lastUpdated !== undefined) return state.dashboard;
    return (await this.store.refresh()).dashboard;
  }

  async refreshDashboard(): Promise<DashboardData> {
    return (await this.store.refresh()).dashboard;
  }

  registerServer(name: string, url: string): Promise<void> {
    return this.store.registerServer(name, url);
  }

  unregisterServer(name: string): Promise<void> {
    return this.store.unregisterServer(name);
  }

  checkAll(): Promise<void> {
    return this.store.checkAll();
  }

  openDetailWebview(serverName: string): void {
    const server = this.store.getState().servers.find((s) => s.name === serverName);
    if (server) {
      createHealthDetailWebview(this.context, server);
    }
  }

  refresh(): Promise<void> {
    return this.store.refresh().then(() => undefined);
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
    const state = this.store.getState();
    if (state.loading) {
      const loadingItem = new vscode.TreeItem('Loading…', vscode.TreeItemCollapsibleState.None);
      loadingItem.iconPath = new vscode.ThemeIcon('loading~spin');
      return [loadingItem];
    }
    if (state.error) {
      const errItem = new vscode.TreeItem(
        '⚠ Connection error',
        vscode.TreeItemCollapsibleState.None
      );
      errItem.description = state.error;
      errItem.tooltip = state.error;
      errItem.iconPath = new vscode.ThemeIcon('error', new vscode.ThemeColor('charts.red'));
      return [errItem];
    }
    if (state.servers.length === 0) {
      return createTreeEmptyState({
        icon: 'pulse',
        title: 'No servers connected',
        description: 'Add a health-monitor-mcp endpoint to start monitoring.',
        actionLabel: 'Add Server',
        actionCommand: COMMAND_IDS.HEALTH_ADD_SERVER,
      });
    }
    return state.servers.map((s) => new McpServerItem(s));
  }

  getCount(): number {
    return this.store.getState().servers.length;
  }

  onConfigChanged(): void {
    this.store.onConfigChanged();
  }

  dispose(): void {
    this.storeSubscription.dispose();
    if (this.ownsStore) this.store.dispose();
    this._onDidChangeTreeData.dispose();
  }

  private onStoreStateChanged(state: HealthState): void {
    if (!state.loading && !state.error) {
      this.updateStatusNotifications(state.servers);
    }
    this._onDidChangeTreeData.fire(undefined);
  }

  private updateStatusNotifications(servers: McpServer[]): void {
    const config = readConfig();
    if (config.health.alertOnDown || config.health.alertOnRecover) {
      for (const server of servers) {
        const prev = this.previousStatuses.get(server.name);
        if (config.health.alertOnDown && prev === 'up' && server.status === 'down') {
          void vscode.window
            .showWarningMessage(`$(error) ${server.name} is DOWN`, 'Open Health Monitor', 'Dismiss')
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

    const serverNames = new Set(servers.map((server) => server.name));
    for (const name of this.previousStatuses.keys()) {
      if (!serverNames.has(name)) this.previousStatuses.delete(name);
    }
  }
}
