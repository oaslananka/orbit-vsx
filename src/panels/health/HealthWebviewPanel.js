"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createHealthDetailWebview = createHealthDetailWebview;
const vscode = require("vscode");
const webview_1 = require("../../utils/webview");
function createHealthDetailWebview(context, server) {
    const panel = vscode.window.createWebviewPanel('orbit.health.detail', `${server.name} - Health Detail`, vscode.ViewColumn.One, {
        enableScripts: true,
        localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'dist', 'webview', 'health')],
    });
    const scriptUri = (0, webview_1.getWebviewUri)(panel.webview, context.extensionUri, [
        'dist',
        'webview',
        'health',
        'index.js',
    ]);
    const nonce = (0, webview_1.getNonce)();
    panel.webview.html = renderHealthDetailHtml(server, scriptUri, nonce);
    panel.webview.onDidReceiveMessage((message) => {
        if (message.type === 'command') {
            vscode.commands.executeCommand(message.command, message.data);
        }
    });
}
function renderHealthDetailHtml(server, _scriptUri, nonce) {
    const uptimeColor = server.status === 'up'
        ? 'var(--vscode-charts-green)'
        : server.status === 'degraded'
            ? 'var(--vscode-charts-yellow)'
            : 'var(--vscode-charts-red)';
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <title>${server.name} - Health Detail</title>
  <style>
    body { font-family: var(--vscode-font-family); color: var(--vscode-editor-foreground); background: var(--vscode-editor-background); padding: 16px; }
    h1 { font-size: 1.4em; margin: 0 0 8px 0; }
    h2 { font-size: 1.1em; margin: 16px 0 8px 0; }
    .badge { display: inline-block; padding: 2px 8px; border-radius: 3px; font-size: 0.85em; font-weight: 600; }
    .badge-up { background: var(--vscode-charts-green); color: #fff; }
    .badge-down { background: var(--vscode-charts-red); color: #fff; }
    .badge-degraded { background: var(--vscode-charts-yellow); color: #000; }
    .stat-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin: 12px 0; }
    .stat-card { background: var(--vscode-list-hoverBackground); padding: 12px; border-radius: 4px; }
    .stat-label { font-size: 0.8em; opacity: 0.7; }
    .stat-value { font-size: 1.3em; font-weight: 600; }
    .uptime-bar { height: 32px; background: var(--vscode-list-hoverBackground); border-radius: 4px; display: flex; overflow: hidden; margin: 8px 0; }
    .uptime-segment { flex: 1; margin: 1px; border-radius: 2px; }
  </style>
</head>
<body>
  <h1>${escapeHtml(server.name)}</h1>
  <span class="badge badge-${server.status}">${server.status.toUpperCase()}</span>
  <p style="opacity:0.7;margin:4px 0;">${escapeHtml(server.url)}</p>

  <div class="stat-grid">
    <div class="stat-card">
      <div class="stat-label">Uptime</div>
      <div class="stat-value" style="color:${uptimeColor}">${server.uptime.toFixed(1)}%</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Latency</div>
      <div class="stat-value">${server.latencyMs}ms avg</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Last Check</div>
      <div class="stat-value">${escapeHtml(server.lastCheck)}</div>
    </div>
  </div>

  <h2>24h Uptime</h2>
  <div class="uptime-bar">
    ${renderUptimeSegments(server.uptime)}
  </div>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
  </script>
</body>
</html>`;
}
function renderUptimeSegments(uptime) {
    const segments = 24;
    const upCount = Math.round((uptime / 100) * segments);
    let html = '';
    for (let i = 0; i < segments; i++) {
        const color = i < upCount ? 'var(--vscode-charts-green)' : 'var(--vscode-charts-red)';
        html += `<div class="uptime-segment" style="background:${color}"></div>`;
    }
    return html;
}
function escapeHtml(text) {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}
