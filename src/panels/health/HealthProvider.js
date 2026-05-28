"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.HealthProvider = void 0;
const vscode = require("vscode");
const config_1 = require("../../config");
const constants_1 = require("../../constants");
const HealthClient_1 = require("./HealthClient");
const logger_1 = require("../../utils/logger");
const HealthWebviewPanel_1 = require("./HealthWebviewPanel");
class McpServerItem extends vscode.TreeItem {
    server;
    constructor(server) {
        super(server.name, vscode.TreeItemCollapsibleState.None);
        this.server = server;
        const iconMap = {
            up: new vscode.ThemeIcon('pulse', new vscode.ThemeColor('charts.green')),
            down: new vscode.ThemeIcon('error', new vscode.ThemeColor('charts.red')),
            degraded: new vscode.ThemeIcon('warning', new vscode.ThemeColor('charts.yellow')),
        };
        this.iconPath = iconMap[server.status] ?? iconMap.degraded;
        this.description = `${server.latencyMs}ms`;
        this.tooltip = new vscode.MarkdownString(`**${server.name}**\n\n` +
            `Status: ${server.status}\n` +
            `URL: ${server.url}\n` +
            `Uptime: ${server.uptime.toFixed(1)}%\n` +
            `Latency: ${server.latencyMs}ms avg\n` +
            `Last check: ${server.lastCheck}`);
        this.contextValue = constants_1.VIEW_ITEM_CONTEXT.MCP_SERVER;
    }
    get serverName() {
        return this.server.name;
    }
}
class HealthProvider {
    context;
    _onDidChangeTreeData = new vscode.EventEmitter();
    onDidChangeTreeData = this._onDidChangeTreeData.event;
    client;
    servers = [];
    pollingTimer;
    logger;
    constructor(context) {
        this.context = context;
        this.logger = new logger_1.Logger('Orbit:Health');
        this.rebuildClient();
        this.startPolling();
    }
    rebuildClient() {
        const config = (0, config_1.readConfig)();
        this.client = new HealthClient_1.HealthClient(config.health.endpoint, config.health.token);
    }
    startPolling() {
        this.stopPolling();
        const config = (0, config_1.readConfig)();
        if (config.health.enabled) {
            this.poll();
            this.pollingTimer = setInterval(() => this.poll(), config.health.pollingIntervalSeconds * 1000);
        }
    }
    stopPolling() {
        if (this.pollingTimer !== undefined) {
            clearInterval(this.pollingTimer);
            this.pollingTimer = undefined;
        }
    }
    async poll() {
        try {
            this.servers = await this.client.listServers();
            this.refresh();
        }
        catch (error) {
            this.logger.warn(`Health poll failed: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    getClient() {
        return this.client;
    }
    getDashboard() {
        return this.client.getDashboard();
    }
    registerServer(name, url) {
        return this.client.registerServer(name, url);
    }
    unregisterServer(name) {
        return this.client.unregisterServer(name);
    }
    checkAll() {
        return this.client.checkAll();
    }
    openDetailWebview(serverName) {
        const server = this.servers.find((s) => s.name === serverName);
        if (server) {
            (0, HealthWebviewPanel_1.createHealthDetailWebview)(this.context, server);
        }
    }
    refresh() {
        this._onDidChangeTreeData.fire(undefined);
    }
    getTreeItem(element) {
        return element;
    }
    getChildren() {
        return this.servers.map((s) => new McpServerItem(s));
    }
    onConfigChanged() {
        this.rebuildClient();
        this.startPolling();
    }
    dispose() {
        this.stopPolling();
    }
}
exports.HealthProvider = HealthProvider;
