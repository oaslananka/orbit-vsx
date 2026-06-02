import * as vscode from 'vscode';
import { COMMAND_IDS } from '../../constants';
import { getNonce, getWebviewUri } from '../../utils/webview';
import { executeAllowedWebviewCommand, getWebviewClipboardText } from '../../utils/webviewMessages';
import type { AgentCard } from './types';

const A2A_WEBVIEW_COMMANDS = new Set<string>([
  COMMAND_IDS.A2A_DISCOVER,
  COMMAND_IDS.A2A_OPEN_CARD,
  COMMAND_IDS.A2A_SCAFFOLD,
]);

export function createA2ADetailWebview(context: vscode.ExtensionContext, card: AgentCard): void {
  const panel = vscode.window.createWebviewPanel(
    'orbit.a2a.detail',
    `${card.name} — Agent Card`,
    vscode.ViewColumn.One,
    {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'dist', 'webview', 'a2a')],
    }
  );

  const scriptUri = getWebviewUri(panel.webview, context.extensionUri, [
    'dist',
    'webview',
    'a2a',
    'index.js',
  ]);
  const nonce = getNonce();

  panel.webview.html = renderA2AShellHtml(card, scriptUri, nonce);

  panel.webview.onDidReceiveMessage((message: unknown) => {
    if (executeAllowedWebviewCommand(message, A2A_WEBVIEW_COMMANDS)) {
      return;
    }

    const clipboardText = getWebviewClipboardText(message);
    if (clipboardText !== undefined) {
      void vscode.env.clipboard.writeText(clipboardText).then(() => {
        void vscode.window.showInformationMessage('Agent card JSON copied to clipboard.');
      });
    }
  });
}

function renderA2AShellHtml(card: AgentCard, scriptUri: vscode.Uri, nonce: string): string {
  const initialData = JSON.stringify(card);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none';
             style-src 'unsafe-inline';
             script-src 'nonce-${nonce}';">
  <title>${escapeHtml(card.name)} — Agent Card</title>
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
