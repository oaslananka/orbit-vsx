import * as vscode from 'vscode';
import { VIEW_ITEM_CONTEXT } from '../../constants';
import { HealthClient } from '../health/HealthClient';
import type { McpServer } from '../health/types';
import { readConfig } from '../../config';
import { Logger } from '../../utils/logger';

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
  implements vscode.TreeDataProvider<McpConnectionItem>, vscode.Disposable
{
  private _onDidChangeTreeData = new vscode.EventEmitter<McpConnectionItem | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private client!: HealthClient;
  private servers: McpServer[] = [];
  private logger: Logger;

  constructor() {
    this.logger = new Logger('Orbit:MCP');
    this.rebuildClient();
  }

  private rebuildClient(): void {
    const config = readConfig();
    this.client = new HealthClient(config.health.endpoint, config.health.token);
  }

  getTreeItem(element: McpConnectionItem): vscode.TreeItem {
    return element;
  }

  getChildren(): McpConnectionItem[] | Promise<McpConnectionItem[]> {
    return this.servers.map((s) => new McpConnectionItem(s));
  }

  async refresh(): Promise<void> {
    try {
      const config = readConfig();
      if (config.health.enabled) {
        const dashboard = await this.client.getDashboard();
        this.servers = dashboard.servers;
      } else {
        this.servers = [];
      }
    } catch (error) {
      this.logger.warn(
        `Failed to list MCP connections: ${error instanceof Error ? error.message : String(error)}`
      );
      this.servers = [];
    }
    this._onDidChangeTreeData.fire(undefined);
  }

  dispose(): void {
    // nothing to dispose
  }
}
