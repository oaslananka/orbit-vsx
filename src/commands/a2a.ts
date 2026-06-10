import * as vscode from 'vscode';
import type { A2AProvider } from '../panels/a2a/A2AProvider';
import { COMMAND_IDS } from '../constants';

export function registerA2ACommands(
  context: vscode.ExtensionContext,
  a2aProvider: A2AProvider
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand(COMMAND_IDS.A2A_REFRESH, () => {
      a2aProvider.refresh();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(COMMAND_IDS.A2A_VALIDATE, async (uri?: vscode.Uri) => {
      const targetUri = uri ?? vscode.window.activeTextEditor?.document.uri;
      if (!targetUri) {
        vscode.window.showWarningMessage('No file selected for validation.');
        return;
      }

      const filePath = targetUri.fsPath;
      try {
        const result = await a2aProvider.getClient().validateAgentCard(filePath);
        const diagnostics: vscode.Diagnostic[] = result.errors.map((msg) => {
          const diag = new vscode.Diagnostic(
            new vscode.Range(0, 0, 0, 0),
            msg,
            vscode.DiagnosticSeverity.Error
          );
          diag.source = 'Orbit A2A';
          return diag;
        });

        const collection = a2aProvider.getDiagnosticCollection();
        collection.set(targetUri, diagnostics);

        if (result.valid) {
          vscode.window.showInformationMessage('Agent card is valid.');
        } else {
          const count = result.errors.length;
          vscode.window.showWarningMessage(
            `Agent card has ${count} validation error${count > 1 ? 's' : ''}.`
          );
        }
      } catch (error) {
        vscode.window.showErrorMessage(
          `Validation failed: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(COMMAND_IDS.A2A_DISCOVER, async () => {
      const url = await vscode.window.showInputBox({
        prompt: 'Enter URL to discover agent card',
        placeHolder: 'https://example.com/.well-known/agent.json',
      });
      if (!url) return;

      try {
        const card = await a2aProvider.getClient().fetchAgentCard(url);
        a2aProvider.openDetailWebviewFromCard(card);
      } catch (error) {
        vscode.window.showErrorMessage(
          `Failed to discover agent: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(COMMAND_IDS.A2A_SCAFFOLD, async () => {
      const name = await vscode.window.showInputBox({
        prompt: 'Enter agent name',
        placeHolder: 'my-agent',
      });
      if (!name) return;

      const adapterTypes = ['generic', 'express', 'cloudflare-worker'];
      const adapter = await vscode.window.showQuickPick(adapterTypes, {
        placeHolder: 'Select adapter type',
      });
      if (!adapter) return;

      try {
        const cliPath = a2aProvider.getClient().getCliPath();
        const { execFile } = await import('node:child_process');
        const { promisify } = await import('node:util');
        const execFileAsync = promisify(execFile);
        await execFileAsync(cliPath, ['scaffold', name, '--adapter', adapter], {
          encoding: 'utf-8',
          timeout: 30000,
        });
        vscode.window.showInformationMessage(`Agent "${name}" scaffolded.`);
        a2aProvider.refresh();
      } catch (error) {
        vscode.window.showErrorMessage(
          `Scaffold failed: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(COMMAND_IDS.A2A_OPEN_CARD, (item) => {
      const agentName = item?.agentName ?? item?.label;
      if (agentName) {
        a2aProvider.openDetailWebview(agentName);
      }
    })
  );
}
