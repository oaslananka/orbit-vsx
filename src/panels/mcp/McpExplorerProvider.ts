import * as vscode from 'vscode';
import { COMMAND_IDS, VIEW_ITEM_CONTEXT } from '../../constants';
import { HealthClient } from '../health/HealthClient';
import type { McpServer } from '../health/types';
import { readConfig } from '../../config';
import { Logger } from '../../utils/logger';
import { createTreeEmptyState } from '../../utils/treeEmptyState';

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
  private _onDidChangeTreeData = new vscode.EventEmitter<
    McpConnectionItem | vscode.TreeItem | undefined
  >();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private client!: HealthClient;
  private servers: McpServer[] = [];
  private logger: Logger;
  private _error: string | undefined;
  private _loading = false;

  constructor() {
    this.logger = new Logger('Orbit:MCP');
    this.rebuildClient();
  }

  private rebuildClient(): void {
    const config = readConfig();
    this.client = new HealthClient(config.health.endpoint, config.health.token);
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
    md.isTrusted = true;
    item.tooltip = md;
    return item;
  }

  getChildren():
    | (McpConnectionItem | vscode.TreeItem)[]
    | Promise<(McpConnectionItem | vscode.TreeItem)[]> {
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
        icon: 'plug',
        title: 'No MCP connections',
        description: 'Register a health-monitor-mcp server to inspect MCP connections.',
        actionLabel: 'Add Server',
        actionCommand: COMMAND_IDS.HEALTH_ADD_SERVER,
      });
    }
    return this.servers.map((s) => new McpConnectionItem(s));
  }

  async refresh(): Promise<void> {
    this._loading = true;
    this._onDidChangeTreeData.fire(undefined);
    try {
      const config = readConfig();
      if (config.health.enabled) {
        const dashboard = await this.client.getDashboard();
        this.servers = dashboard.servers;
      } else {
        this.servers = [];
      }
      this._error = undefined;
    } catch (error) {
      this._error = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Failed to list MCP connections: ${this._error}`);
      this.servers = [];
    }
    this._loading = false;
    this._onDidChangeTreeData.fire(undefined);
  }

  getCount(): number {
    return this.servers.length;
  }

  dispose(): void {
    // nothing to dispose
  }
}
