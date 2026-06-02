import * as crypto from 'node:crypto';
import * as vscode from 'vscode';

const NONCE_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
const NONCE_LENGTH = 64;

/**
 * Creates an unbiased random CSP nonce for VS Code webview scripts.
 */
export function getNonce(): string {
  const result = new Array<string>(NONCE_LENGTH);
  for (let i = 0; i < NONCE_LENGTH; i++) {
    result[i] = NONCE_ALPHABET[crypto.randomInt(NONCE_ALPHABET.length)];
  }
  return result.join('');
}

/**
 * Converts extension-relative path segments into a URI that can be loaded by a webview.
 */
export function getWebviewUri(
  webview: vscode.Webview,
  extensionUri: vscode.Uri,
  pathSegments: string[]
): vscode.Uri {
  return webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, ...pathSegments));
}
