import * as vscode from 'vscode';
import { readConfig } from '../../config';
import { VIEW_ITEM_CONTEXT } from '../../constants';
import { DebugClient } from './DebugClient';
import type { DebugSession } from './types';
import { Logger } from '../../utils/logger';
import { createDebugDetailWebview } from './DebugWebviewPanel';

class DebugGroupItem extends vscode.TreeItem {
  constructor(
    label: string,
    public readonly sessions: DebugSession[]
  ) {
    super(
      label,
      sessions.length > 0
        ? vscode.TreeItemCollapsibleState.Collapsed
        : vscode.TreeItemCollapsibleState.None
    );
    this.id = `debug-group:${label}`;
    this.tooltip = new vscode.MarkdownString(`**${label}**\n\nSessions: ${sessions.length}`);
    this.contextValue = 'debugGroup';
  }
}

class DebugSessionItem extends vscode.TreeItem {
  constructor(public readonly session: DebugSession) {
    super(session.title, vscode.TreeItemCollapsibleState.None);

    const iconMap: Record<string, vscode.IconPath> = {
      open: new vscode.ThemeIcon('debug'),
      resolved: new vscode.ThemeIcon('check', new vscode.ThemeColor('charts.green')),
      abandoned: new vscode.ThemeIcon('error', new vscode.ThemeColor('charts.red')),
    };
    this.id = `debug-session:${session.id}`;
    this.iconPath = iconMap[session.status] ?? iconMap.open;

    this.description = session.createdAt;
    this.tooltip = new vscode.MarkdownString(
      `**${session.title}**\n\nStatus: ${session.status}\nID: ${session.id}`
    );
    this.contextValue = VIEW_ITEM_CONTEXT.DEBUG_SESSION;
  }

  get sessionId(): string {
    return this.session.id;
  }
}

export class DebugProvider implements vscode.TreeDataProvider<vscode.TreeItem>, vscode.Disposable {
  private _onDidChangeTreeData = new vscode.EventEmitter<vscode.TreeItem | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private client!: DebugClient;
  private sessions: DebugSession[] = [];
  private logger: Logger;
  private activeGroup: DebugGroupItem | undefined;
  private recentGroup: DebugGroupItem | undefined;
  private _error: string | undefined;
  private _loading = false;

  constructor(private _context: vscode.ExtensionContext) {
    this.logger = new Logger('Orbit:Debug');
    this.rebuildClient();
  }

  private rebuildClient(): void {
    const config = readConfig();
    this.client = new DebugClient(config.debug.endpoint, config.debug.token);
  }

  getClient(): DebugClient {
    return this.client;
  }

  openDetailWebview(sessionId: string): void {
    createDebugDetailWebview(this._context, this.client, sessionId);
  }

  async refresh(): Promise<void> {
    this._loading = true;
    this._onDidChangeTreeData.fire(undefined);
    try {
      const config = readConfig();
      if (config.debug.enabled) {
        this.sessions = await this.client.listSessions();
        this.buildGroups();
      }
      this._error = undefined;
    } catch (error) {
      this._error = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Failed to list sessions: ${this._error}`);
    }
    this._loading = false;
    this._onDidChangeTreeData.fire(undefined);
  }

  private buildGroups(): void {
    const active = this.sessions.filter((s) => s.status === 'open');
    const recent = this.sessions.filter((s) => s.status !== 'open');

    this.activeGroup = active.length > 0 ? new DebugGroupItem('Active', active) : undefined;
    this.recentGroup =
      recent.length > 0 ? new DebugGroupItem('Recent (7 days)', recent) : undefined;
  }

  getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
    return element;
  }

  resolveTreeItem(item: vscode.TreeItem): vscode.TreeItem {
    if (item instanceof DebugSessionItem) {
      const s = item.session;
      const fixes = s.fixAttempts ?? [];
      const cmds = s.terminalCommands ?? [];
      const md = new vscode.MarkdownString(
        `**${s.title}**  \n` +
          `Status: \`${s.status}\`  \n` +
          `ID: \`${s.id}\`  \n` +
          `Created: ${s.createdAt}  \n` +
          `Fix attempts: ${fixes.length}  \n` +
          `Commands: ${cmds.length}`,
        true
      );
      md.isTrusted = true;
      item.tooltip = md;
    }
    return item;
  }

  getChildren(element?: vscode.TreeItem): vscode.TreeItem[] {
    if (!element) {
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
      const items: vscode.TreeItem[] = [];
      if (this.activeGroup) items.push(this.activeGroup);
      if (this.recentGroup) items.push(this.recentGroup);
      if (items.length === 0) {
        const emptyItem = new vscode.TreeItem('No debug sessions');
        emptyItem.description = 'Start a new session to begin tracking';
        return [emptyItem];
      }
      return items;
    }

    if (element instanceof DebugGroupItem) {
      return element.sessions.map((s) => new DebugSessionItem(s));
    }

    return [];
  }

  onConfigChanged(): void {
    this.rebuildClient();
  }

  dispose(): void {
    // no-op
  }
}
