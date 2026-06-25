import * as vscode from 'vscode';
import { COMMAND_IDS } from '../../constants';
import { getNonce, getWebviewUri, renderOrbitWebviewHtml } from '../../utils/webview';
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

  panel.webview.html = renderOrbitWebviewHtml({
    title: `${server.name} — Health Detail`,
    webview: panel.webview,
    scriptUri,
    nonce,
    initialData: server,
  });

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
