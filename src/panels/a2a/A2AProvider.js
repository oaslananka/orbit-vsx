"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.A2AProvider = void 0;
const vscode = require("vscode");
const config_1 = require("../../config");
const constants_1 = require("../../constants");
const A2AClient_1 = require("./A2AClient");
const logger_1 = require("../../utils/logger");
const A2AWebviewPanel_1 = require("./A2AWebviewPanel");
class A2ARegistryItem extends vscode.TreeItem {
    entries;
    constructor(registryUrl, entries) {
        super(`Registry (${registryUrl})`, entries.length > 0
            ? vscode.TreeItemCollapsibleState.Collapsed
            : vscode.TreeItemCollapsibleState.None);
        this.entries = entries;
        this.iconPath = new vscode.ThemeIcon('cloud');
        this.contextValue = 'a2aRegistry';
    }
}
class A2AAgentItem extends vscode.TreeItem {
    entry;
    constructor(entry) {
        const card = entry.card;
        super(`${card.name}  v${card.version}`, vscode.TreeItemCollapsibleState.None);
        this.entry = entry;
        this.iconPath = entry.online
            ? new vscode.ThemeIcon('circuit-board')
            : new vscode.ThemeIcon('circuit-board', new vscode.ThemeColor('charts.red'));
        this.description = entry.online ? '' : '(offline)';
        this.tooltip = new vscode.MarkdownString(`**${card.name}** v${card.version}\n\n${card.description}\n\nOnline: ${entry.online}`);
        this.contextValue = constants_1.VIEW_ITEM_CONTEXT.A2A_AGENT;
    }
    get agentName() {
        return this.entry.card.name;
    }
}
class A2ALocalCardItem extends vscode.TreeItem {
    constructor(filePath) {
        super(filePath, vscode.TreeItemCollapsibleState.None);
        this.iconPath = new vscode.ThemeIcon('file');
        this.description = 'local card';
        this.contextValue = 'a2aLocalCard';
    }
}
class A2AProvider {
    _context;
    _onDidChangeTreeData = new vscode.EventEmitter();
    onDidChangeTreeData = this._onDidChangeTreeData.event;
    client;
    entries = [];
    localCards = [];
    registryItem;
    diagnosticCollection;
    logger;
    constructor(_context) {
        this._context = _context;
        this.logger = new logger_1.Logger('Orbit:A2A');
        this.diagnosticCollection = vscode.languages.createDiagnosticCollection('orbit.a2a');
        this.rebuildClient();
    }
    rebuildClient() {
        const config = (0, config_1.readConfig)();
        this.client = new A2AClient_1.A2AClient(config.a2a.registryUrl, config.a2a.cliPath);
    }
    getClient() {
        return this.client;
    }
    getDiagnosticCollection() {
        return this.diagnosticCollection;
    }
    openDetailWebview(agentName) {
        const entry = this.entries.find((e) => e.card.name === agentName);
        if (entry) {
            (0, A2AWebviewPanel_1.createA2ADetailWebview)(this._context, entry.card);
        }
    }
    openDetailWebviewFromCard(card) {
        (0, A2AWebviewPanel_1.createA2ADetailWebview)(this._context, card);
    }
    async refresh() {
        try {
            const config = (0, config_1.readConfig)();
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
        }
        catch (error) {
            this.logger.warn(`Failed to list agents: ${error instanceof Error ? error.message : String(error)}`);
        }
        this._onDidChangeTreeData.fire(undefined);
    }
    getTreeItem(element) {
        return element;
    }
    getChildren(element) {
        if (!element) {
            const items = [];
            if (this.registryItem)
                items.push(this.registryItem);
            if (this.localCards.length > 0) {
                const localItem = new vscode.TreeItem('Local Cards', vscode.TreeItemCollapsibleState.Collapsed);
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
    onConfigChanged() {
        this.rebuildClient();
    }
    dispose() {
        this.diagnosticCollection.dispose();
    }
}
exports.A2AProvider = A2AProvider;
