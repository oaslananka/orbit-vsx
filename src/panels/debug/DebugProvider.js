"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DebugProvider = void 0;
const vscode = require("vscode");
const config_1 = require("../../config");
const constants_1 = require("../../constants");
const DebugClient_1 = require("./DebugClient");
const logger_1 = require("../../utils/logger");
const DebugWebviewPanel_1 = require("./DebugWebviewPanel");
class DebugGroupItem extends vscode.TreeItem {
    sessions;
    constructor(label, sessions) {
        super(label, sessions.length > 0
            ? vscode.TreeItemCollapsibleState.Collapsed
            : vscode.TreeItemCollapsibleState.None);
        this.sessions = sessions;
        this.contextValue = 'debugGroup';
    }
}
class DebugSessionItem extends vscode.TreeItem {
    session;
    constructor(session) {
        super(session.title, vscode.TreeItemCollapsibleState.None);
        this.session = session;
        const iconMap = {
            open: new vscode.ThemeIcon('debug'),
            resolved: new vscode.ThemeIcon('check', new vscode.ThemeColor('charts.green')),
            abandoned: new vscode.ThemeIcon('error', new vscode.ThemeColor('charts.red')),
        };
        this.iconPath = iconMap[session.status] ?? iconMap.open;
        this.description = session.createdAt;
        this.tooltip = new vscode.MarkdownString(`**${session.title}**\n\nStatus: ${session.status}\nID: ${session.id}`);
        this.contextValue = constants_1.VIEW_ITEM_CONTEXT.DEBUG_SESSION;
    }
    get sessionId() {
        return this.session.id;
    }
}
class DebugProvider {
    _context;
    _onDidChangeTreeData = new vscode.EventEmitter();
    onDidChangeTreeData = this._onDidChangeTreeData.event;
    client;
    sessions = [];
    logger;
    activeGroup;
    recentGroup;
    constructor(_context) {
        this._context = _context;
        this.logger = new logger_1.Logger('Orbit:Debug');
        this.rebuildClient();
    }
    rebuildClient() {
        const config = (0, config_1.readConfig)();
        this.client = new DebugClient_1.DebugClient(config.debug.endpoint, config.debug.token);
    }
    getClient() {
        return this.client;
    }
    openDetailWebview(sessionId) {
        (0, DebugWebviewPanel_1.createDebugDetailWebview)(this._context, sessionId);
    }
    async refresh() {
        try {
            const config = (0, config_1.readConfig)();
            if (config.debug.enabled) {
                this.sessions = await this.client.listSessions();
                this.buildGroups();
            }
        }
        catch (error) {
            this.logger.warn(`Failed to list sessions: ${error instanceof Error ? error.message : String(error)}`);
        }
        this._onDidChangeTreeData.fire(undefined);
    }
    buildGroups() {
        const active = this.sessions.filter((s) => s.status === 'open');
        const recent = this.sessions.filter((s) => s.status !== 'open');
        this.activeGroup = active.length > 0 ? new DebugGroupItem('Active', active) : undefined;
        this.recentGroup =
            recent.length > 0 ? new DebugGroupItem('Recent (7 days)', recent) : undefined;
    }
    getTreeItem(element) {
        return element;
    }
    getChildren(element) {
        if (!element) {
            const items = [];
            if (this.activeGroup)
                items.push(this.activeGroup);
            if (this.recentGroup)
                items.push(this.recentGroup);
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
    onConfigChanged() {
        this.rebuildClient();
    }
    dispose() {
        // no-op
    }
}
exports.DebugProvider = DebugProvider;
