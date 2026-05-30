import * as vscode from 'vscode';
import { COMMAND_IDS } from '../constants';

export function registerSessionCommands(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand(COMMAND_IDS.SESSIONS_REFRESH, () => {
      vscode.commands.executeCommand('workbench.actions.treeView.orbit.sessions.refresh');
    })
  );
}
