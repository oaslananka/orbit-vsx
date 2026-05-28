"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Logger = void 0;
const vscode = require("vscode");
const constants_1 = require("../constants");
class Logger {
    channel;
    constructor(name = constants_1.OUTPUT_CHANNEL_NAME) {
        this.channel = vscode.window.createOutputChannel(name);
    }
    info(message) {
        const timestamp = new Date().toISOString();
        this.channel.appendLine(`[INFO ${timestamp}] ${message}`);
    }
    warn(message) {
        const timestamp = new Date().toISOString();
        this.channel.appendLine(`[WARN ${timestamp}] ${message}`);
    }
    error(message, error) {
        const timestamp = new Date().toISOString();
        this.channel.appendLine(`[ERROR ${timestamp}] ${message}`);
        if (error instanceof Error) {
            this.channel.appendLine(`  ${error.message}`);
            if (error.stack) {
                this.channel.appendLine(`  ${error.stack}`);
            }
        }
        else if (error !== undefined) {
            this.channel.appendLine(`  ${String(error)}`);
        }
    }
    show() {
        this.channel.show();
    }
    dispose() {
        this.channel.dispose();
    }
}
exports.Logger = Logger;
