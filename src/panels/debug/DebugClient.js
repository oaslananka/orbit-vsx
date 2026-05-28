"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DebugClient = void 0;
const http_1 = require("../../utils/http");
class DebugClient {
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
    async listSessions() {
        const result = await this.mcpCall('list_sessions');
        return result.sessions;
    }
    async startDebugSession(title) {
        return this.mcpCall('start_debug_session', { title });
    }
    async closeSession(id) {
        await this.mcpCall('close_session', { id });
    }
    async getSessionContext(id) {
        return this.mcpCall('get_session_context', { id });
    }
    async searchSessions(query) {
        return this.mcpCall('search_sessions', { query });
    }
    async findSimilarErrors(errorText) {
        const result = await this.mcpCall('find_similar_errors', {
            errorText,
        });
        return result.sessions;
    }
    async recordCommand(sessionId, command) {
        await this.mcpCall('record_command', { sessionId, command });
    }
    async addFix(sessionId, description) {
        await this.mcpCall('add_fix', { sessionId, description });
    }
}
exports.DebugClient = DebugClient;
