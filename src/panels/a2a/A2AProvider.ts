import * as vscode from 'vscode';
import { readConfig } from '../../config';
import { VIEW_ITEM_CONTEXT } from '../../constants';
import { A2AClient } from './A2AClient';
import type { AgentCard, AgentRegistryEntry } from './types';
import { Logger } from '../../utils/logger';
import { createA2ADetailWebview } from './A2AWebviewPanel';

class A2ARegistryItem extends vscode.TreeItem {
  constructor(
    registryUrl: string,
    public readonly entries: AgentRegistryEntry[]
  ) {
    super(
      `Registry (${registryUrl})`,
      entries.length > 0
        ? vscode.TreeItemCollapsibleState.Collapsed
        : vscode.TreeItemCollapsibleState.None
    );
    this.id = `a2a-registry:${registryUrl}`;
    this.iconPath = new vscode.ThemeIcon('cloud');
    this.tooltip = new vscode.MarkdownString(
      `**Agent Registry**\n\nURL: \`${registryUrl}\`\nAgents: ${entries.length}`
    );
    this.contextValue = 'a2aRegistry';
  }
}

class A2AAgentItem extends vscode.TreeItem {
  constructor(public readonly entry: AgentRegistryEntry) {
    const card = entry.card;
    super(`${card.name}  v${card.version}`, vscode.TreeItemCollapsibleState.None);
    this.id = `a2a-agent:${card.name}`;
    this.iconPath = entry.online
      ? new vscode.ThemeIcon('circuit-board')
      : new vscode.ThemeIcon('circuit-board', new vscode.ThemeColor('charts.red'));
    this.description = entry.online ? '' : '(offline)';
    this.tooltip = new vscode.MarkdownString(
      `**${card.name}** v${card.version}\n\n${card.description}\n\nOnline: ${entry.online}`
    );
    this.contextValue = VIEW_ITEM_CONTEXT.A2A_AGENT;
  }

  get agentName(): string {
    return this.entry.card.name;
  }
}

class A2ALocalCardItem extends vscode.TreeItem {
  constructor(filePath: string) {
    super(filePath, vscode.TreeItemCollapsibleState.None);
    this.id = `a2a-local:${filePath}`;
    this.iconPath = new vscode.ThemeIcon('file');
    this.description = 'local card';
    this.tooltip = new vscode.MarkdownString(`**Local Agent Card**\n\n\`${filePath}\``);
    this.contextValue = 'a2aLocalCard';
  }
}

export class A2AProvider implements vscode.TreeDataProvider<vscode.TreeItem>, vscode.Disposable {
  private _onDidChangeTreeData = new vscode.EventEmitter<vscode.TreeItem | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private client!: A2AClient;
  private entries: AgentRegistryEntry[] = [];
  private localCards: string[] = [];
  private registryItem: A2ARegistryItem | undefined;
  private diagnosticCollection: vscode.DiagnosticCollection;
  private logger: Logger;
  private _error: string | undefined;
  private _loading = false;

  constructor(private _context: vscode.ExtensionContext) {
    this.logger = new Logger('Orbit:A2A');
    this.diagnosticCollection = vscode.languages.createDiagnosticCollection('orbit.a2a');
    this.rebuildClient();
  }

  private rebuildClient(): void {
    const config = readConfig();
    this.client = new A2AClient(config.a2a.registryUrl, config.a2a.cliPath);
  }

  getClient(): A2AClient {
    return this.client;
  }

  getDiagnosticCollection(): vscode.DiagnosticCollection {
    return this.diagnosticCollection;
  }

  openDetailWebview(agentName: string): void {
    const entry = this.entries.find((e) => e.card.name === agentName);
    if (entry) {
      createA2ADetailWebview(this._context, entry.card);
    }
  }

  openDetailWebviewFromCard(card: AgentCard): void {
    createA2ADetailWebview(this._context, card);
  }

  async refresh(): Promise<void> {
    this._loading = true;
    this._onDidChangeTreeData.fire(undefined);
    try {
      const config = readConfig();
      if (config.a2a.enabled) {
        this.entries = await this.client.listAgents();
        this.registryItem =
          this.entries.length > 0
            ? new A2ARegistryItem(config.a2a.registryUrl, this.entries)
            : undefined;

        // Find local agent-card.json files in workspace
        this.localCards = [];
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (workspaceFolders) {
          for (const folder of workspaceFolders) {
            const pattern = new vscode.RelativePattern(folder, '**/agent-card.json');
            const files = await vscode.workspace.findFiles(pattern, '**/node_modules/**', 10);
            this.localCards.push(...files.map((f) => f.fsPath));
          }
        }
      }
      this._error = undefined;
    } catch (error) {
      this._error = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Failed to list agents: ${this._error}`);
    }
    this._loading = false;
    this._onDidChangeTreeData.fire(undefined);
  }

  getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
    return element;
  }

  resolveTreeItem(item: vscode.TreeItem): vscode.TreeItem {
    if (item instanceof A2AAgentItem) {
      const card = item.entry.card;
      const skills = card.skills ?? [];
      const md = new vscode.MarkdownString(
        `**${card.name}** v${card.version}  \n` +
          `${card.description}  \n` +
          `Online: \`${item.entry.online}\`  \n` +
          `Skills: ${skills.length > 0 ? skills.join(', ') : 'none'}`,
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
      if (this.registryItem) items.push(this.registryItem);
      if (this.localCards.length > 0) {
        const localItem = new vscode.TreeItem(
          'Local Cards',
          vscode.TreeItemCollapsibleState.Collapsed
        );
        localItem.iconPath = new vscode.ThemeIcon('folder');
        items.push(localItem);
      }
      if (items.length === 0) {
        const emptyItem = new vscode.TreeItem('No agents found');
        emptyItem.description = 'Add an agent or discover one to begin';
        return [emptyItem];
      }
      return items;
    }

    if (element instanceof A2ARegistryItem) {
      return element.entries.map((e) => new A2AAgentItem(e));
    }

    // Local Cards folder - return local card items
    if (element.label === 'Local Cards') {
      return this.localCards.map((fp) => new A2ALocalCardItem(fp));
    }

    return [];
  }

  onConfigChanged(): void {
    this.rebuildClient();
  }

  dispose(): void {
    this.diagnosticCollection.dispose();
  }
}
