import * as crypto from 'node:crypto';
import * as vscode from 'vscode';
import { escapeHtml, serializeJsonForInlineScript } from './escapeHtml';

const NONCE_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
const NONCE_LENGTH = 64;

export interface OrbitWebviewHtmlOptions {
  title: string;
  webview: vscode.Webview;
  scriptUri: vscode.Uri;
  nonce: string;
  initialData?: unknown;
}

export function getNonce(): string {
  const result = new Array<string>(NONCE_LENGTH);
  for (let i = 0; i < NONCE_LENGTH; i++) {
    result[i] = NONCE_ALPHABET[crypto.randomInt(NONCE_ALPHABET.length)];
  }
  return result.join('');
}

export function getWebviewUri(
  webview: vscode.Webview,
  extensionUri: vscode.Uri,
  pathSegments: string[]
): vscode.Uri {
  return webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, ...pathSegments));
}

export function renderOrbitWebviewHtml(options: OrbitWebviewHtmlOptions): string {
  const initialDataScript =
    options.initialData === undefined
      ? ''
      : `\n  <script nonce="${options.nonce}">\n    window.__ORBIT_DATA__ = ${serializeJsonForInlineScript(options.initialData)};\n  </script>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none';
             img-src ${options.webview.cspSource} https:;
             font-src ${options.webview.cspSource};
             style-src ${options.webview.cspSource} 'unsafe-inline';
             script-src 'nonce-${options.nonce}';">
  <title>${escapeHtml(options.title)}</title>
</head>
<body>
  <div id="root" data-orbit-webview-root="true"></div>${initialDataScript}
  <script nonce="${options.nonce}" src="${options.scriptUri.toString()}"></script>
</body>
</html>`;
}
