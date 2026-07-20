import * as vscode from 'vscode';
import { COMMAND_IDS } from '../../constants';
import { getNonce, getWebviewUri, renderOrbitWebviewHtml } from '../../utils/webview';
import { executeAllowedWebviewCommand, getWebviewClipboardText } from '../../utils/webviewMessages';
import type { AgentCardInspection } from './types';

const A2A_WEBVIEW_COMMANDS = new Set<string>([
  COMMAND_IDS.A2A_DISCOVER,
  COMMAND_IDS.A2A_OPEN_CARD,
  COMMAND_IDS.A2A_SCAFFOLD,
]);

export function createA2ADetailWebview(
  context: vscode.ExtensionContext,
  inspection: AgentCardInspection
): void {
  const panel = vscode.window.createWebviewPanel(
    'orbit.a2a.detail',
    `${inspection.card.name} — Agent Card`,
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

  panel.webview.html = renderOrbitWebviewHtml({
    title: `${inspection.card.name} — Agent Card`,
    webview: panel.webview,
    scriptUri,
    nonce,
    initialData: inspection,
  });

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
