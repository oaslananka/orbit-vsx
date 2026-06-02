import * as vscode from 'vscode';

type WebviewMessageRecord = {
  command?: unknown;
  data?: unknown;
  description?: unknown;
  text?: unknown;
  type?: unknown;
};

/** Returns a safe object view of a message posted from a webview. */
export function getWebviewMessageRecord(message: unknown): WebviewMessageRecord | undefined {
  if (typeof message !== 'object' || message === null || Array.isArray(message)) {
    return undefined;
  }
  return message as WebviewMessageRecord;
}

/** Returns clipboard text from a valid webview clipboard message. */
export function getWebviewClipboardText(message: unknown): string | undefined {
  const record = getWebviewMessageRecord(message);
  if (record?.type !== 'copyToClipboard' || typeof record.text !== 'string') {
    return undefined;
  }
  return record.text;
}

/** Executes a command message only when the command is explicitly allowed. */
export function executeAllowedWebviewCommand(
  message: unknown,
  allowedCommands: ReadonlySet<string>
): boolean {
  const record = getWebviewMessageRecord(message);
  if (record?.type !== 'command' || typeof record.command !== 'string') {
    return false;
  }
  if (!allowedCommands.has(record.command)) {
    return false;
  }
  void vscode.commands.executeCommand(record.command, record.data);
  return true;
}
