import * as vscode from 'vscode';
import { COMMAND_IDS } from '../../constants';
import { getNonce, getWebviewUri } from '../../utils/webview';
import {
  executeAllowedWebviewCommand,
  getWebviewClipboardText,
  getWebviewMessageRecord,
} from '../../utils/webviewMessages';
import type { DebugClient } from './DebugClient';
import type { DebugSession } from './types';

const DEBUG_WEBVIEW_COMMANDS = new Set<string>([COMMAND_IDS.DEBUG_NEW_SESSION]);

export function createDebugDetailWebview(
  context: vscode.ExtensionContext,
  client: DebugClient,
  sessionId: string
): void {
  const panel = vscode.window.createWebviewPanel(
    'orbit.debug.detail',
    `Session — ${sessionId.slice(0, 8)}`,
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

  panel.webview.html = renderDebugShellHtml(scriptUri, nonce);

  panel.webview.onDidReceiveMessage((message: unknown) => {
    if (executeAllowedWebviewCommand(message, DEBUG_WEBVIEW_COMMANDS)) {
      return;
    }

    const record = getWebviewMessageRecord(message);
    if (!record) {
      return;
    }

    if (record.type === 'ready') {
      void client
        .getSessionContext(sessionId)
        .then((session: DebugSession) => {
          void panel.webview.postMessage({ type: 'update', payload: session });
        })
        .catch(() => {
          void panel.webview.postMessage({
            type: 'error',
            payload: { message: `Could not load session ${sessionId}` },
          });
        });
    }
    if (record.type === 'addFix' && typeof record.description === 'string') {
      void client
        .addFix(sessionId, record.description)
        .then(() => client.getSessionContext(sessionId))
        .then((session: DebugSession) => {
          void panel.webview.postMessage({ type: 'update', payload: session });
        })
        .catch((error) => {
          const messageText = error instanceof Error ? error.message : String(error);
          void panel.webview.postMessage({
            type: 'error',
            payload: { message: `Could not add fix: ${messageText}` },
          });
        });
    }
    const clipboardText = getWebviewClipboardText(record);
    if (clipboardText !== undefined) {
      void vscode.env.clipboard.writeText(clipboardText);
    }
  });
}

function renderDebugShellHtml(scriptUri: vscode.Uri, nonce: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none';
             style-src 'unsafe-inline';
             script-src 'nonce-${nonce}';">
  <title>Debug Session</title>
</head>
<body>
  <div id="root"></div>
  <script nonce="${nonce}" src="${scriptUri.toString()}"></script>
</body>
</html>`;
}
