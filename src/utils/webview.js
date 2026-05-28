"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getNonce = getNonce;
exports.getWebviewUri = getWebviewUri;
const crypto = require("node:crypto");
const vscode = require("vscode");
function getNonce() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    const length = 64;
    const bytes = crypto.randomBytes(length);
    const result = new Array(length);
    for (let i = 0; i < length; i++) {
        result[i] = chars[bytes[i] % chars.length];
    }
    return result.join('');
}
function getWebviewUri(webview, extensionUri, pathSegments) {
    return webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, ...pathSegments));
}
