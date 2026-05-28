"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.HealthClient = void 0;
const http_1 = require("../../utils/http");
class HealthClient {
    endpoint;
    token;
    constructor(endpoint, token) {
        this.endpoint = endpoint;
        this.token = token;
    }
    get headers() {
        if (!this.token)
            return {};
        return { Authorization: `Bearer ${this.token}` };
    }
    async checkHealth() {
        try {
            await (0, http_1.getJson)(`${this.endpoint}/health`, this.headers, 5000);
            return true;
        }
        catch {
            return false;
        }
    }
    async mcpCall(method, params) {
        const request = {
            jsonrpc: '2.0',
            method: 'tools/call',
            params: { name: method, arguments: params ?? {} },
            id: Date.now(),
        };
        const response = await (0, http_1.postJson)(`${this.endpoint}/mcp`, request, this.headers);
        if (response.error) {
            throw new Error(`MCP error: ${response.error.message}`);
        }
        return response.result;
    }
    async listServers() {
        const result = await this.mcpCall('list_servers');
        return result.servers;
    }
    async registerServer(name, url) {
        await this.mcpCall('register_server', { name, url });
    }
    async unregisterServer(name) {
        await this.mcpCall('unregister_server', { name });
    }
    async getDashboard() {
        return this.mcpCall('get_dashboard');
    }
    async checkAll() {
        await this.mcpCall('check_all');
    }
    async getUptime(name) {
        const result = await this.mcpCall('get_uptime', { name });
        return result.uptime;
    }
}
exports.HealthClient = HealthClient;
