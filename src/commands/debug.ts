import * as vscode from 'vscode';
import type { DebugProvider } from '../panels/debug/DebugProvider';
import { COMMAND_IDS } from '../constants';
import { requireWorkspaceTrust } from '../utils/workspaceTrust';
import { recordAuditEvent } from '../utils/audit';

export function registerDebugCommands(
  context: vscode.ExtensionContext,
  debugProvider: DebugProvider
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand(COMMAND_IDS.DEBUG_REFRESH, async () => {
      if (!(await requireWorkspaceTrust('Refreshing Orbit debug sessions'))) return;
      debugProvider.refresh();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(COMMAND_IDS.DEBUG_NEW_SESSION, async () => {
      if (!(await requireWorkspaceTrust('Starting a debug recorder session'))) return;

      const title = await vscode.window.showInputBox({
        prompt: 'Enter debug session title',
        placeHolder: 'Fix authentication bug',
      });
      if (!title) return;

      try {
        recordAuditEvent({
          surface: 'debug',
          operation: 'start_debug_session',
          outcome: 'started',
        });
        await debugProvider.getClient().startDebugSession(title);
        recordAuditEvent({
          surface: 'debug',
          operation: 'start_debug_session',
          outcome: 'success',
        });
        vscode.window.showInformationMessage(`Debug session "${title}" started.`);
        debugProvider.refresh();
      } catch (error) {
        recordAuditEvent({
          surface: 'debug',
          operation: 'start_debug_session',
          outcome: 'failure',
        });
        vscode.window.showErrorMessage(
          `Failed to start session: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(COMMAND_IDS.DEBUG_CLOSE_SESSION, async (item) => {
      if (!(await requireWorkspaceTrust('Closing a debug recorder session'))) return;

      const sessionId = item?.sessionId;
      if (!sessionId) return;

      const confirm = await vscode.window.showQuickPick(['Yes', 'No'], {
        placeHolder: `Close debug session?`,
      });
      if (confirm !== 'Yes') return;

      try {
        recordAuditEvent({
          surface: 'debug',
          operation: 'close_debug_session',
          outcome: 'started',
          target: sessionId,
        });
        await debugProvider.getClient().closeSession(sessionId);
        recordAuditEvent({
          surface: 'debug',
          operation: 'close_debug_session',
          outcome: 'success',
          target: sessionId,
        });
        vscode.window.showInformationMessage('Session closed.');
        debugProvider.refresh();
      } catch (error) {
        recordAuditEvent({
          surface: 'debug',
          operation: 'close_debug_session',
          outcome: 'failure',
          target: sessionId,
        });
        vscode.window.showErrorMessage(
          `Failed to close session: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(COMMAND_IDS.DEBUG_SEARCH, async () => {
      if (!(await requireWorkspaceTrust('Searching debug recorder sessions'))) return;

      const query = await vscode.window.showInputBox({
        prompt: 'Search debug sessions',
        placeHolder: 'error message or keyword',
      });
      if (!query) return;

      try {
        const results = await debugProvider.getClient().searchSessions(query);
        if (results.sessions.length === 0) {
          vscode.window.showInformationMessage('No sessions found.');
          return;
        }
        const items = results.sessions.map((s) => ({
          label: s.title,
          description: s.status,
          detail: s.errorText ?? '',
          sessionId: s.id,
        }));
        const picked = await vscode.window.showQuickPick(items, {
          placeHolder: `Found ${results.total} sessions`,
        });
        if (picked) {
          debugProvider.openDetailWebview(picked.sessionId);
        }
      } catch (error) {
        vscode.window.showErrorMessage(
          `Search failed: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(COMMAND_IDS.DEBUG_OPEN_SESSION, (item) => {
      const sessionId = item?.sessionId ?? item?.id;
      if (sessionId) {
        debugProvider.openDetailWebview(sessionId);
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(COMMAND_IDS.DEBUG_RECORD_COMMAND, async () => {
      if (!(await requireWorkspaceTrust('Recording a terminal command'))) return;

      const clipboardText = await vscode.env.clipboard.readText();
      const command = await vscode.window.showInputBox({
        prompt: 'Record terminal command',
        value: clipboardText || '',
        placeHolder: 'npm run build',
      });
      if (!command) return;

      const sessionId = await vscode.window.showInputBox({
        prompt: 'Debug session ID to record to',
        placeHolder: 'Enter session ID from the tree view',
      });
      if (!sessionId) return;

      try {
        recordAuditEvent({
          surface: 'debug',
          operation: 'record_command',
          outcome: 'started',
          target: sessionId,
        });
        await debugProvider.getClient().recordCommand(sessionId, command);
        recordAuditEvent({
          surface: 'debug',
          operation: 'record_command',
          outcome: 'success',
          target: sessionId,
        });
        vscode.window.showInformationMessage('Command recorded.');
      } catch (error) {
        recordAuditEvent({
          surface: 'debug',
          operation: 'record_command',
          outcome: 'failure',
          target: sessionId,
        });
        vscode.window.showErrorMessage(
          `Failed to record command: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    })
  );
}
