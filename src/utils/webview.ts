import * as crypto from 'node:crypto';
import * as vscode from 'vscode';

export function getNonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const length = 64;
  const bytes = crypto.randomBytes(length);
  const result = new Array(length);
  for (let i = 0; i < length; i++) {
    result[i] = chars[bytes[i] % chars.length];
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
