import * as vscode from 'vscode';
import { COMMAND_IDS } from '../../constants';
import { getNonce, getWebviewUri } from '../../utils/webview';
import { executeAllowedWebviewCommand, getWebviewClipboardText } from '../../utils/webviewMessages';
import type { McpServer } from './types';

const HEALTH_WEBVIEW_COMMANDS = new Set<string>([
  COMMAND_IDS.HEALTH_ADD_SERVER,
  COMMAND_IDS.HEALTH_OPEN_DETAIL,
]);

export function createHealthDetailWebview(
  context: vscode.ExtensionContext,
  server: McpServer
): void {
  const panel = vscode.window.createWebviewPanel(
    'orbit.health.detail',
    `${server.name} — Health Detail`,
    vscode.ViewColumn.One,
    {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'dist', 'webview', 'health')],
    }
  );

  const scriptUri = getWebviewUri(panel.webview, context.extensionUri, [
    'dist',
    'webview',
    'health',
    'index.js',
  ]);
  const nonce = getNonce();

  panel.webview.html = renderHealthDetailHtml(server, scriptUri, nonce);

  panel.webview.onDidReceiveMessage((message: unknown) => {
    if (executeAllowedWebviewCommand(message, HEALTH_WEBVIEW_COMMANDS)) {
      return;
    }

    const clipboardText = getWebviewClipboardText(message);
    if (clipboardText !== undefined) {
      void vscode.env.clipboard.writeText(clipboardText).then(() => {
        void vscode.window.showInformationMessage('Copied to clipboard.');
      });
    }
  });
}

function renderHealthDetailHtml(server: McpServer, scriptUri: vscode.Uri, nonce: string): string {
  const initialData = JSON.stringify(server);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none';
             style-src 'unsafe-inline';
             script-src 'nonce-${nonce}';">
  <title>${escapeHtml(server.name)} — Health Detail</title>
</head>
<body>
  <div id="root"></div>
  <script nonce="${nonce}">
    window.__ORBIT_DATA__ = ${initialData};
  </script>
  <script nonce="${nonce}" src="${scriptUri.toString()}"></script>
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
