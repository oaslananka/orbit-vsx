"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.A2AClient = void 0;
const node_child_process_1 = require("node:child_process");
const http_1 = require("../../utils/http");
class A2AClient {
    registryUrl;
    cliPath;
    constructor(registryUrl, cliPath) {
        this.registryUrl = registryUrl;
        this.cliPath = cliPath;
    }
    getCliPath() {
        return this.cliPath;
    }
    async listAgents() {
        return (0, http_1.getJson)(`${this.registryUrl}/agents`, undefined, 10000);
    }
    async getAgent(name) {
        return (0, http_1.getJson)(`${this.registryUrl}/agents/${encodeURIComponent(name)}`, undefined, 10000);
    }
    async fetchAgentCard(url) {
        return (0, http_1.getJson)(url, undefined, 15000);
    }
    validateAgentCard(filePath) {
        try {
            (0, node_child_process_1.execFileSync)(this.cliPath, ['validate', filePath], {
                encoding: 'utf-8',
                timeout: 30000,
            });
            return { valid: true, errors: [] };
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            const lines = message.split('\n').filter((l) => l.trim().length > 0);
            return { valid: false, errors: lines };
        }
    }
}
exports.A2AClient = A2AClient;
