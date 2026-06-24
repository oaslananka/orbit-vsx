import * as vscode from 'vscode';

export const WORKSPACE_TRUST_REQUIRED_MESSAGE =
  'Workspace is not trusted. Trust this workspace to enable Orbit network, file scan, and CLI operations.';

export function isWorkspaceTrusted(): boolean {
  return vscode.workspace.isTrusted;
}

export async function requireWorkspaceTrust(action: string): Promise<boolean> {
  if (isWorkspaceTrusted()) return true;

  const selection = await vscode.window.showWarningMessage(
    `${action} requires a trusted workspace.`,
    'Manage Workspace Trust'
  );
  if (selection === 'Manage Workspace Trust') {
    await vscode.commands.executeCommand('workbench.trust.manage');
  }
  return false;
}
