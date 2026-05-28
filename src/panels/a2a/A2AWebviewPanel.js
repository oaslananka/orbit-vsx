"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createA2ADetailWebview = createA2ADetailWebview;
const vscode = require("vscode");
const webview_1 = require("../../utils/webview");
function createA2ADetailWebview(context, card) {
    const panel = vscode.window.createWebviewPanel('orbit.a2a.detail', `${card.name} - Agent Card`, vscode.ViewColumn.One, {
        enableScripts: true,
        localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'dist', 'webview', 'a2a')],
    });
    const scriptUri = (0, webview_1.getWebviewUri)(panel.webview, context.extensionUri, [
        'dist',
        'webview',
        'a2a',
        'index.js',
    ]);
    const nonce = (0, webview_1.getNonce)();
    panel.webview.html = renderA2ADetailHtml(card, scriptUri, nonce);
    panel.webview.onDidReceiveMessage((message) => {
        if (message.type === 'command') {
            vscode.commands.executeCommand(message.command, message.data);
        }
    });
}
function renderA2ADetailHtml(card, _scriptUri, nonce) {
    const skillsHtml = card.skills
        .map((s) => `<div class="skill-item"><strong>${escapeHtml(s.name)}</strong><br><span style="opacity:0.7;">${escapeHtml(s.description)}</span></div>`)
        .join('');
    const authBadge = card.authentication
        ? `<span class="auth-badge">${card.authentication.type.toUpperCase()}</span>`
        : '';
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <title>${card.name} - Agent Card</title>
  <style>
    body { font-family: var(--vscode-font-family); color: var(--vscode-editor-foreground); background: var(--vscode-editor-background); padding: 16px; }
    h1 { font-size: 1.4em; margin: 0 0 4px 0; }
    .version { opacity: 0.6; font-size: 0.9em; }
    .section { background: var(--vscode-list-hoverBackground); padding: 12px; border-radius: 4px; margin: 12px 0; }
    .section h2 { font-size: 1.1em; margin: 0 0 8px 0; }
    .skill-item { padding: 6px 0; border-bottom: 1px solid var(--vscode-input-border); }
    .skill-item:last-child { border-bottom: none; }
    .auth-badge { display: inline-block; padding: 2px 8px; border-radius: 3px; background: var(--vscode-badge-background); color: var(--vscode-badge-foreground); font-size: 0.8em; font-weight: 600; }
    .json-container { background: var(--vscode-input-background); padding: 12px; border-radius: 4px; overflow-x: auto; }
    pre { margin: 0; font-family: var(--vscode-editor-font-family); font-size: 0.85em; white-space: pre-wrap; }
    button { background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; padding: 4px 12px; border-radius: 2px; cursor: pointer; font-size: 0.9em; }
    button:hover { background: var(--vscode-button-hoverBackground); }
    .actions { display: flex; gap: 8px; margin: 12px 0; }
  </style>
</head>
<body>
  <h1>${escapeHtml(card.name)}</h1>
  <div class="version">v${escapeHtml(card.version)} ${authBadge}</div>
  <p>${escapeHtml(card.description)}</p>

  <div class="actions">
    <button onclick="copyJson()">Copy as JSON</button>
    <button onclick="toggleJson()">Toggle Raw JSON</button>
  </div>

  <div id="cardView">
    <div class="section">
      <h2>Details</h2>
      <p><strong>URL:</strong> ${card.url ? escapeHtml(card.url) : 'N/A'}</p>
    </div>

    <div class="section">
      <h2>Skills (${card.skills.length})</h2>
      ${skillsHtml || '<p style="opacity:0.5;">No skills defined.</p>'}
    </div>
  </div>

  <div id="rawJson" style="display:none;" class="json-container">
    <pre>${escapeHtml(JSON.stringify(card, null, 2))}</pre>
  </div>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    let showRaw = false;
    function toggleJson() {
      showRaw = !showRaw;
      document.getElementById('cardView').style.display = showRaw ? 'none' : 'block';
      document.getElementById('rawJson').style.display = showRaw ? 'block' : 'none';
    }
    function copyJson() {
      vscode.postMessage({ type: 'command', command: 'copy', data: ${JSON.stringify(JSON.stringify(card, null, 2))} });
    }
  </script>
</body>
</html>`;
}
function escapeHtml(text) {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}
