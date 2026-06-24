import * as vscode from 'vscode';
import { readConfig } from '../../config';
import { COMMAND_IDS, VIEW_ITEM_CONTEXT } from '../../constants';
import { createTreeEmptyState } from '../../utils/treeEmptyState';
import type { HealthStore } from '../health/HealthStore';
import type { McpServer } from '../health/types';

class McpConnectionItem extends vscode.TreeItem {
  constructor(public readonly server: McpServer) {
    super(server.name, vscode.TreeItemCollapsibleState.None);

    const iconMap: Record<string, vscode.ThemeIcon> = {
      up: new vscode.ThemeIcon('plug', new vscode.ThemeColor('charts.green')),
      down: new vscode.ThemeIcon('plug', new vscode.ThemeColor('charts.red')),
      degraded: new vscode.ThemeIcon('plug', new vscode.ThemeColor('charts.yellow')),
    };
    this.id = `mcp-connection:${server.name}`;
    this.iconPath = iconMap[server.status] ?? iconMap.degraded;

    this.description = `${server.url} — ${server.latencyMs}ms`;
    this.tooltip = new vscode.MarkdownString(
      `**${server.name}**\n\n` +
        `URL: ${server.url}\n` +
        `Status: ${server.status}\n` +
        `Latency: ${server.latencyMs}ms\n` +
        `Uptime: ${server.uptime.toFixed(1)}%\n` +
        `Last check: ${server.lastCheck}`
    );
    this.contextValue = VIEW_ITEM_CONTEXT.MCP_SERVER;
  }
}

export class McpExplorerProvider
  implements vscode.TreeDataProvider<McpConnectionItem | vscode.TreeItem>, vscode.Disposable
{
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<
    McpConnectionItem | vscode.TreeItem | undefined
  >();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private readonly storeSubscription: vscode.Disposable;

  constructor(private readonly healthStore: HealthStore) {
    this.storeSubscription = this.healthStore.onDidChangeState(() => this.fireTreeDataChanged());
  }

  getTreeItem(element: McpConnectionItem | vscode.TreeItem): vscode.TreeItem {
    return element;
  }

  resolveTreeItem(item: McpConnectionItem | vscode.TreeItem): vscode.TreeItem {
    if (!(item instanceof McpConnectionItem)) return item;
    const s = item.server;
    const pipelines = s.pipelineGroups ?? [];
    const pipelineInfo =
      pipelines.length > 0
        ? `\n\nPipelines:\n${pipelines.map((p) => `  • ${p.name}: ${p.status}`).join('\n')}`
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

  getChildren(): (McpConnectionItem | vscode.TreeItem)[] {
    const config = readConfig();
    const state = this.healthStore.getState();
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
    if (!config.mcpExplorer.enabled || state.servers.length === 0) {
      return createTreeEmptyState({
        icon: 'plug',
        title: 'No MCP connections',
        description: 'Register a health-monitor-mcp server to inspect MCP connections.',
        actionLabel: 'Add Server',
        actionCommand: COMMAND_IDS.HEALTH_ADD_SERVER,
      });
    }
    return state.servers.map((s) => new McpConnectionItem(s));
  }

  async refresh(): Promise<void> {
    if (readConfig().mcpExplorer.enabled) {
      await this.healthStore.refresh();
    } else {
      this.fireTreeDataChanged();
    }
  }

  getCount(): number {
    if (!readConfig().mcpExplorer.enabled) return 0;
    return this.healthStore.getState().servers.length;
  }

  onConfigChanged(): void {
    void this.refresh();
  }

  dispose(): void {
    this.storeSubscription.dispose();
    this._onDidChangeTreeData.dispose();
  }

  private fireTreeDataChanged(): void {
    this._onDidChangeTreeData.fire(undefined);
  }
}
