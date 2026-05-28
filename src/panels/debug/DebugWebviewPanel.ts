import * as vscode from 'vscode';
import { getNonce, getWebviewUri } from '../../utils/webview';

export function createDebugDetailWebview(
  context: vscode.ExtensionContext,
  sessionId: string
): void {
  const panel = vscode.window.createWebviewPanel(
    'orbit.debug.detail',
    `Session - ${sessionId.slice(0, 8)}`,
    vscode.ViewColumn.One,
    {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'dist', 'webview', 'debug')],
    }
  );

  const scriptUri = getWebviewUri(panel.webview, context.extensionUri, [
    'dist',
    'webview',
    'debug',
    'index.js',
  ]);
  const nonce = getNonce();

  panel.webview.html = renderDebugDetailHtml(sessionId, scriptUri, nonce);

  panel.webview.onDidReceiveMessage((message) => {
    if (message.type === 'command') {
      vscode.commands.executeCommand(message.command, message.data);
    }
  });
}

function renderDebugDetailHtml(sessionId: string, _scriptUri: vscode.Uri, nonce: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <title>Debug Session Detail</title>
  <style>
    body { font-family: var(--vscode-font-family); color: var(--vscode-editor-foreground); background: var(--vscode-editor-background); padding: 16px; }
    h1 { font-size: 1.4em; margin: 0 0 8px 0; }
    h2 { font-size: 1.1em; margin: 16px 0 8px 0; }
    .section { background: var(--vscode-list-hoverBackground); padding: 12px; border-radius: 4px; margin: 8px 0; }
    .label { font-size: 0.8em; opacity: 0.7; }
    .tag { display: inline-block; background: var(--vscode-badge-background); color: var(--vscode-badge-foreground); padding: 2px 6px; border-radius: 3px; font-size: 0.8em; margin: 2px; }
    .fix-item { display: flex; align-items: center; gap: 8px; padding: 4px 0; }
    .cmd-item { font-family: var(--vscode-editor-font-family); background: var(--vscode-input-background); padding: 4px 8px; border-radius: 3px; margin: 4px 0; font-size: 0.9em; }
  </style>
</head>
<body>
  <h1>Session Detail</h1>
  <p style="opacity:0.7;">ID: ${escapeHtml(sessionId)}</p>

  <div class="section">
    <div class="label">Session ID</div>
    <div>${escapeHtml(sessionId)}</div>
  </div>

  <div class="section">
    <h2>Fix Attempts</h2>
    <p style="opacity:0.5;">Fix data loads from the debug-recorder-mcp API.</p>
  </div>

  <div class="section">
    <h2>Terminal Commands</h2>
    <p style="opacity:0.5;">Command log loads from the debug-recorder-mcp API.</p>
  </div>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
  </script>
</body>
</html>`;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
