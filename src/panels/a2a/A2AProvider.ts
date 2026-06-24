import * as vscode from 'vscode';
import { readConfig } from '../../config';
import { COMMAND_IDS, VIEW_ITEM_CONTEXT } from '../../constants';
import { createTreeEmptyState } from '../../utils/treeEmptyState';
import { isWorkspaceTrusted, WORKSPACE_TRUST_REQUIRED_MESSAGE } from '../../utils/workspaceTrust';
import { Logger } from '../../utils/logger';
import { validateAgentCardText } from './agentCardValidation';
import { A2AClient } from './A2AClient';
import { createA2ADetailWebview } from './A2AWebviewPanel';
import type { AgentCard, AgentRegistryEntry, LocalAgentCard, ValidationResult } from './types';

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
    this.description = entry.online ? 'valid' : 'offline';
    this.tooltip = new vscode.MarkdownString(
      `**${card.name}** v${card.version}\n\n${card.description}\n\nOnline: ${entry.online}\nValidation: valid`
    );
    this.contextValue = VIEW_ITEM_CONTEXT.A2A_AGENT;
  }

  get agentName(): string {
    return this.entry.card.name;
  }
}

class A2ALocalCardItem extends vscode.TreeItem {
  constructor(public readonly localCard: LocalAgentCard) {
    super(localCard.filePath, vscode.TreeItemCollapsibleState.None);
    this.id = `a2a-local:${localCard.filePath}`;
    this.iconPath = localCard.validation.valid
      ? new vscode.ThemeIcon('file-code', new vscode.ThemeColor('charts.green'))
      : new vscode.ThemeIcon('error', new vscode.ThemeColor('charts.red'));
    this.description = localCard.validation.valid ? 'valid local card' : 'invalid local card';
    const errors = localCard.validation.errors.slice(0, 8).join('\n');
    this.tooltip = new vscode.MarkdownString(
      `**Local Agent Card**\n\n\`${localCard.filePath}\`\n\nValidation: ${localCard.validation.valid ? 'valid' : 'invalid'}${errors ? `\n\nErrors:\n${errors}` : ''}`
    );
    this.contextValue = 'a2aLocalCard';
  }
}

export class A2AProvider implements vscode.TreeDataProvider<vscode.TreeItem>, vscode.Disposable {
  private _onDidChangeTreeData = new vscode.EventEmitter<vscode.TreeItem | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private client!: A2AClient;
  private entries: AgentRegistryEntry[] = [];
  private localCards: LocalAgentCard[] = [];
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
      if (!isWorkspaceTrusted()) {
        this.entries = [];
        this.localCards = [];
        this.registryItem = undefined;
        this._error = WORKSPACE_TRUST_REQUIRED_MESSAGE;
      } else if (config.a2a.enabled) {
        this.entries = await this.client.listAgents();
        this.registryItem =
          this.entries.length > 0
            ? new A2ARegistryItem(config.a2a.registryUrl, this.entries)
            : undefined;
        this.localCards = await this.scanLocalCards(
          config.a2a.localCardScanLimit,
          config.a2a.localCardExcludeGlob
        );
      } else {
        this.entries = [];
        this.localCards = [];
        this.registryItem = undefined;
      }
      if (isWorkspaceTrusted()) {
        this._error = undefined;
      }
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
      const skillNames = skills.map((skill) => skill.name).join(', ');
      const md = new vscode.MarkdownString(
        `**${card.name}** v${card.version}  \n` +
          `${card.description}  \n` +
          `Online: \`${item.entry.online}\`  \n` +
          `Interfaces: ${card.supportedInterfaces.map((agentInterface) => agentInterface.protocolBinding).join(', ')}  \n` +
          `Input: ${card.defaultInputModes.join(', ')}  \n` +
          `Output: ${card.defaultOutputModes.join(', ')}  \n` +
          `Skills: ${skillNames.length > 0 ? skillNames : 'none'}`,
        true
      );
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
        const invalidCount = this.localCards.filter((card) => !card.validation.valid).length;
        localItem.iconPath =
          invalidCount > 0 ? new vscode.ThemeIcon('warning') : new vscode.ThemeIcon('folder');
        localItem.description =
          invalidCount > 0 ? `${invalidCount} invalid` : `${this.localCards.length} valid`;
        items.push(localItem);
      }
      if (items.length === 0) {
        return createTreeEmptyState({
          icon: 'graph',
          title: 'No agents found',
          description: 'Discover agents from a URL or scaffold a new one.',
          actionLabel: 'Discover Agent',
          actionCommand: COMMAND_IDS.A2A_DISCOVER,
          actionIcon: 'search',
        });
      }
      return items;
    }

    if (element instanceof A2ARegistryItem) {
      return element.entries.map((e) => new A2AAgentItem(e));
    }

    if (element.label === 'Local Cards') {
      return this.localCards.map((localCard) => new A2ALocalCardItem(localCard));
    }

    return [];
  }

  getCount(): number {
    return this.entries.length;
  }

  onConfigChanged(): void {
    this.rebuildClient();
    void this.refresh();
  }

  dispose(): void {
    this.diagnosticCollection.dispose();
    this._onDidChangeTreeData.dispose();
    this.logger.dispose();
  }

  private async scanLocalCards(scanLimit: number, excludeGlob: string): Promise<LocalAgentCard[]> {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) return [];

    const localCards: LocalAgentCard[] = [];
    for (const folder of workspaceFolders) {
      const pattern = new vscode.RelativePattern(folder, '**/agent-card.json');
      const files = await vscode.workspace.findFiles(pattern, excludeGlob, scanLimit);
      for (const file of files) {
        localCards.push(await this.validateLocalCard(file));
      }
    }
    return localCards;
  }

  private async validateLocalCard(uri: vscode.Uri): Promise<LocalAgentCard> {
    try {
      const bytes = await vscode.workspace.fs.readFile(uri);
      const text = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
      const validation = validateAgentCardText(text);
      this.updateLocalDiagnostics(uri, text, validation);
      return { filePath: uri.fsPath, validation };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const validation: ValidationResult = { errors: [message], valid: false };
      this.updateLocalDiagnostics(uri, '', validation);
      return { filePath: uri.fsPath, validation };
    }
  }

  private updateLocalDiagnostics(
    uri: vscode.Uri,
    text: string,
    validation: ValidationResult
  ): void {
    if (validation.valid) {
      this.diagnosticCollection.delete(uri);
      return;
    }
    const diagnostics = validation.errors.map((message) => {
      const range = createDiagnosticRange(text, message);
      const diagnostic = new vscode.Diagnostic(range, message, vscode.DiagnosticSeverity.Error);
      diagnostic.source = 'Orbit A2A';
      return diagnostic;
    });
    this.diagnosticCollection.set(uri, diagnostics);
  }
}

function createDiagnosticRange(text: string, message: string): vscode.Range {
  const keyMatch = /\.([A-Za-z][A-Za-z0-9_-]*)(?:\[|:|\.|$)/.exec(message);
  if (keyMatch) {
    const key = keyMatch[1];
    const index = text.indexOf(`"${key}"`);
    if (index >= 0) return positionRangeAtOffset(text, index, key.length + 2);
  }
  return new vscode.Range(0, 0, 0, 1);
}

function positionRangeAtOffset(text: string, offset: number, length: number): vscode.Range {
  const prefix = text.slice(0, offset);
  const line = prefix.split('\n').length - 1;
  const lineStart = prefix.lastIndexOf('\n') + 1;
  const character = offset - lineStart;
  return new vscode.Range(line, character, line, character + length);
}
