import * as vscode from 'vscode';
import { readConfig } from '../../config';
import { COMMAND_IDS, VIEW_ITEM_CONTEXT } from '../../constants';
import { recordAuditEvent } from '../../utils/audit';
import { Logger } from '../../utils/logger';
import { createTreeEmptyState } from '../../utils/treeEmptyState';
import { isWorkspaceTrusted, WORKSPACE_TRUST_REQUIRED_MESSAGE } from '../../utils/workspaceTrust';
import { A2AClient } from './A2AClient';
import { createA2ADetailWebview } from './A2AWebviewPanel';
import { AgentCardTrustVerifier } from './agentCardTrust';
import type {
  AgentCard,
  AgentCardDocumentInspection,
  AgentCardInspection,
  AgentCardTrustResult,
  AgentRegistryEntry,
  LocalAgentCard,
  ValidationResult,
} from './types';

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
    const trustCounts = countTrustStates(entries.map((entry) => entry.trust));
    this.tooltip = new vscode.MarkdownString(
      `**Agent Registry**\n\nURL: \`${registryUrl}\`\n\nAgents: ${entries.length}\n\nTrust: ${formatTrustCounts(trustCounts)}`
    );
    this.contextValue = 'a2aRegistry';
  }
}

class A2AAgentItem extends vscode.TreeItem {
  constructor(public readonly entry: AgentRegistryEntry) {
    const card = entry.card;
    super(`${card.name}  v${card.version}`, vscode.TreeItemCollapsibleState.None);
    this.id = `a2a-agent:${card.name}`;
    this.iconPath = trustThemeIcon(entry.trust, entry.online);
    this.description = `${entry.online ? 'online' : 'offline'} · ${entry.trust.state}`;
    this.tooltip = new vscode.MarkdownString(
      `**${card.name}** v${card.version}\n\n${card.description}\n\nOnline: ${entry.online}\n\nSchema: ${entry.validation.valid ? 'valid' : 'invalid'}\n\nSignature trust: **${entry.trust.state}**\n\n${entry.trust.summary}`
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
      ? trustThemeIcon(localCard.trust, true, 'file-code')
      : new vscode.ThemeIcon('error', new vscode.ThemeColor('charts.red'));
    this.description = `${localCard.validation.valid ? 'valid' : 'invalid'} · ${localCard.trust.state}`;
    const errors = localCard.validation.errors.slice(0, 8).join('\n');
    this.tooltip = new vscode.MarkdownString(
      `**Local Agent Card**\n\n\`${localCard.filePath}\`\n\nSchema: ${localCard.validation.valid ? 'valid' : 'invalid'}\n\nSignature trust: **${localCard.trust.state}**\n\n${localCard.trust.summary}${errors ? `\n\nErrors:\n${errors}` : ''}`
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
    this.client = new A2AClient(
      config.a2a.registryUrl,
      config.a2a.cliPath,
      undefined,
      new AgentCardTrustVerifier({ trustedJwksUrls: config.a2a.trustedJwksUrls })
    );
  }

  getClient(): A2AClient {
    return this.client;
  }

  getDiagnosticCollection(): vscode.DiagnosticCollection {
    return this.diagnosticCollection;
  }

  openDetailWebview(agentName: string): void {
    const entry = this.entries.find((candidate) => candidate.card.name === agentName);
    if (entry) {
      createA2ADetailWebview(this._context, {
        card: entry.card,
        trust: entry.trust,
        validation: entry.validation,
      });
    }
  }

  openDetailWebviewFromInspection(inspection: AgentCardInspection): void {
    createA2ADetailWebview(this._context, inspection);
  }

  openDetailWebviewFromCard(card: AgentCard, trust = inferredTrust(card)): void {
    createA2ADetailWebview(this._context, {
      card,
      trust,
      validation: { errors: [], valid: true },
    });
  }

  async inspectAgentCardText(text: string): Promise<AgentCardDocumentInspection> {
    return this.client.inspectAgentCardText(text);
  }

  updateDocumentDiagnostics(
    uri: vscode.Uri,
    text: string,
    inspection: AgentCardDocumentInspection,
    additionalErrors: string[] = []
  ): void {
    this.updateLocalDiagnostics(
      uri,
      text,
      {
        errors: [...inspection.validation.errors, ...additionalErrors],
        valid: inspection.validation.valid && additionalErrors.length === 0,
      },
      inspection.trust
    );
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
        this.entries.forEach((entry) =>
          auditTrustResult(entry.trust, { kind: 'identifier', value: entry.card.name })
        );
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
          `Schema: \`${item.entry.validation.valid ? 'valid' : 'invalid'}\`  \n` +
          `Signature trust: \`${item.entry.trust.state}\`  \n` +
          `Trust detail: ${item.entry.trust.summary}  \n` +
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
        const unsafeCount = this.localCards.filter(
          (card) => card.trust.state === 'invalid' || card.trust.state === 'key-unavailable'
        ).length;
        localItem.iconPath =
          invalidCount > 0 || unsafeCount > 0
            ? new vscode.ThemeIcon('warning')
            : new vscode.ThemeIcon('folder');
        localItem.description =
          invalidCount > 0
            ? `${invalidCount} invalid`
            : unsafeCount > 0
              ? `${unsafeCount} trust warning`
              : `${this.localCards.length} checked`;
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
      return element.entries.map((entry) => new A2AAgentItem(entry));
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
      const inspection = await this.client.inspectAgentCardText(text);
      auditTrustResult(inspection.trust, { kind: 'path', value: uri.fsPath });
      this.updateDocumentDiagnostics(uri, text, inspection);
      return {
        filePath: uri.fsPath,
        ...(inspection.card ? { card: inspection.card } : {}),
        validation: inspection.validation,
        trust: inspection.trust,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const validation: ValidationResult = { errors: [message], valid: false };
      const trust: AgentCardTrustResult = {
        reason: 'schema_invalid',
        signatureCount: 0,
        state: 'unverified',
        summary: 'Signature trust was not evaluated because the Agent Card could not be read.',
      };
      this.updateLocalDiagnostics(uri, '', validation, trust);
      return { filePath: uri.fsPath, validation, trust };
    }
  }

  private updateLocalDiagnostics(
    uri: vscode.Uri,
    text: string,
    validation: ValidationResult,
    trust: AgentCardTrustResult
  ): void {
    const diagnostics = validation.errors.map((message) => {
      const range = createDiagnosticRange(text, message);
      const diagnostic = new vscode.Diagnostic(range, message, vscode.DiagnosticSeverity.Error);
      diagnostic.source = 'Orbit A2A Schema';
      return diagnostic;
    });

    if (validation.valid && trust.state !== 'verified') {
      const trustDiagnostic = new vscode.Diagnostic(
        createDiagnosticRange(text, '$.signatures'),
        `Agent Card signature trust: ${trust.state}. ${trust.summary}`,
        trustDiagnosticSeverity(trust)
      );
      trustDiagnostic.source = 'Orbit A2A Trust';
      trustDiagnostic.code = `orbit.a2a.trust.${trust.state}`;
      diagnostics.push(trustDiagnostic);
    }

    if (diagnostics.length === 0) {
      this.diagnosticCollection.delete(uri);
    } else {
      this.diagnosticCollection.set(uri, diagnostics);
    }
  }
}

function auditTrustResult(
  trust: AgentCardTrustResult,
  target: { kind: 'identifier' | 'path'; value: string }
): void {
  recordAuditEvent({
    surface: 'a2a',
    operation: 'verify_agent_card_signature',
    outcome:
      trust.state === 'verified' || trust.state === 'unsigned'
        ? 'success'
        : trust.reason === 'untrusted_key_url' || trust.reason === 'unsafe_algorithm'
          ? 'blocked'
          : 'failure',
    target,
    detail: `trust:${trust.state}`,
  });
}

function inferredTrust(card: AgentCard): AgentCardTrustResult {
  return card.signatures?.length
    ? {
        reason: 'unsupported_algorithm',
        signatureCount: card.signatures.length,
        state: 'unverified',
        summary: 'Agent Card signatures have not been cryptographically verified.',
      }
    : {
        reason: 'no_signatures',
        signatureCount: 0,
        state: 'unsigned',
        summary: 'Agent Card is unsigned.',
      };
}

function trustDiagnosticSeverity(trust: AgentCardTrustResult): vscode.DiagnosticSeverity {
  switch (trust.state) {
    case 'invalid':
      return vscode.DiagnosticSeverity.Error;
    case 'key-unavailable':
    case 'unverified':
      return vscode.DiagnosticSeverity.Warning;
    default:
      return vscode.DiagnosticSeverity.Information;
  }
}

function trustThemeIcon(
  trust: AgentCardTrustResult,
  online: boolean,
  fallbackIcon = 'circuit-board'
): vscode.ThemeIcon {
  if (!online || trust.state === 'invalid') {
    return new vscode.ThemeIcon('error', new vscode.ThemeColor('charts.red'));
  }
  if (trust.state === 'verified') {
    return new vscode.ThemeIcon('verified-filled', new vscode.ThemeColor('charts.green'));
  }
  if (trust.state === 'key-unavailable' || trust.state === 'unverified') {
    return new vscode.ThemeIcon('warning', new vscode.ThemeColor('charts.yellow'));
  }
  return new vscode.ThemeIcon(fallbackIcon);
}

function countTrustStates(results: AgentCardTrustResult[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const result of results) counts[result.state] = (counts[result.state] ?? 0) + 1;
  return counts;
}

function formatTrustCounts(counts: Record<string, number>): string {
  const entries = Object.entries(counts);
  return entries.length === 0
    ? 'none'
    : entries.map(([state, count]) => `${state}=${count}`).join(', ');
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
