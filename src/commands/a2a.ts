import * as fs from 'node:fs';
import * as path from 'node:path';
import * as vscode from 'vscode';
import type { A2AProvider } from '../panels/a2a/A2AProvider';
import { COMMAND_IDS } from '../constants';
import { requireWorkspaceTrust } from '../utils/workspaceTrust';
import { recordAuditEvent } from '../utils/audit';
import { isPublicNetworkPolicyError } from '../utils/publicJsonFetch';

function getWorkspaceFolderForUri(uri: vscode.Uri): vscode.WorkspaceFolder | undefined {
  return vscode.workspace.getWorkspaceFolder(uri);
}

async function pickScaffoldFolder(): Promise<vscode.WorkspaceFolder | undefined> {
  const folders = vscode.workspace.workspaceFolders ?? [];
  if (folders.length === 0) {
    vscode.window.showWarningMessage('Open a workspace folder before scaffolding an A2A agent.');
    return undefined;
  }
  if (folders.length === 1) return folders[0];

  const picked = await vscode.window.showQuickPick(
    folders.map((folder) => ({ label: folder.name, description: folder.uri.fsPath, folder })),
    { placeHolder: 'Select workspace folder for the new A2A agent' }
  );
  return picked?.folder;
}

export function registerA2ACommands(
  context: vscode.ExtensionContext,
  a2aProvider: A2AProvider
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand(COMMAND_IDS.A2A_REFRESH, async () => {
      if (!(await requireWorkspaceTrust('Refreshing A2A registry data'))) return;
      a2aProvider.refresh();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(COMMAND_IDS.A2A_VALIDATE, async (uri?: vscode.Uri) => {
      if (!(await requireWorkspaceTrust('Validating an agent card with the local A2A CLI'))) return;

      const targetUri = uri ?? vscode.window.activeTextEditor?.document.uri;
      if (!targetUri) {
        vscode.window.showWarningMessage('No file selected for validation.');
        return;
      }

      const filePath = targetUri.fsPath;
      const cwd = getWorkspaceFolderForUri(targetUri)?.uri.fsPath;
      try {
        recordAuditEvent({
          surface: 'cli',
          operation: 'validate_agent_card',
          outcome: 'started',
          target: filePath,
        });
        const result = await a2aProvider.getClient().validateAgentCard(filePath, cwd);
        recordAuditEvent({
          surface: 'cli',
          operation: 'validate_agent_card',
          outcome: result.valid ? 'success' : 'failure',
          target: filePath,
        });
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
        recordAuditEvent({
          surface: 'cli',
          operation: 'validate_agent_card',
          outcome: 'failure',
          target: filePath,
        });
        vscode.window.showErrorMessage(
          `Validation failed: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(COMMAND_IDS.A2A_DISCOVER, async () => {
      if (!(await requireWorkspaceTrust('Discovering an agent card over the network'))) return;

      const url = await vscode.window.showInputBox({
        prompt: 'Enter URL to discover agent card',
        placeHolder: 'https://example.com/.well-known/agent.json',
      });
      if (!url) return;

      try {
        recordAuditEvent({
          surface: 'network',
          operation: 'discover_agent_card',
          outcome: 'started',
          target: url,
        });
        const card = await a2aProvider.getClient().fetchAgentCard(url);
        recordAuditEvent({
          surface: 'network',
          operation: 'discover_agent_card',
          outcome: 'success',
          target: url,
        });
        a2aProvider.openDetailWebviewFromCard(card);
      } catch (error) {
        const policyError = isPublicNetworkPolicyError(error) ? error : undefined;
        recordAuditEvent({
          surface: 'network',
          operation: 'discover_agent_card',
          outcome: policyError ? 'blocked' : 'failure',
          target: url,
          ...(policyError ? { detail: policyError.code } : {}),
        });
        vscode.window.showErrorMessage(
          `Failed to discover agent: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(COMMAND_IDS.A2A_SCAFFOLD, async () => {
      if (!(await requireWorkspaceTrust('Scaffolding an A2A agent with the local CLI'))) return;

      const workspaceFolder = await pickScaffoldFolder();
      if (!workspaceFolder) return;

      const name = await vscode.window.showInputBox({
        prompt: 'Enter agent name',
        placeHolder: 'my-agent',
        validateInput: (value) =>
          /^[a-zA-Z0-9._-]+$/.test(value.trim())
            ? undefined
            : 'Use only letters, numbers, dots, underscores, or dashes.',
      });
      if (!name) return;

      const adapterTypes = ['generic', 'express', 'cloudflare-worker'];
      const adapter = await vscode.window.showQuickPick(adapterTypes, {
        placeHolder: 'Select adapter type',
      });
      if (!adapter) return;

      const targetPath = path.join(workspaceFolder.uri.fsPath, name);
      if (fs.existsSync(targetPath)) {
        vscode.window.showWarningMessage(`Target folder already exists: ${targetPath}`);
        return;
      }

      try {
        const cliPath = a2aProvider.getClient().getCliPath();
        const { execFile } = await import('node:child_process');
        const { promisify } = await import('node:util');
        const execFileAsync = promisify(execFile);
        recordAuditEvent({
          surface: 'cli',
          operation: 'scaffold_agent',
          outcome: 'started',
          target: targetPath,
          detail: adapter,
        });
        const output = await execFileAsync(cliPath, ['scaffold', name, '--adapter', adapter], {
          cwd: workspaceFolder.uri.fsPath,
          encoding: 'utf-8',
          timeout: 30000,
        });
        if (output.stdout || output.stderr) {
          const channel = vscode.window.createOutputChannel('Orbit:A2A');
          context.subscriptions.push(channel);
          if (output.stdout) channel.appendLine(output.stdout.trimEnd());
          if (output.stderr) channel.appendLine(output.stderr.trimEnd());
          channel.show(true);
        }
        recordAuditEvent({
          surface: 'cli',
          operation: 'scaffold_agent',
          outcome: 'success',
          target: targetPath,
          detail: adapter,
        });
        vscode.window.showInformationMessage(
          `Agent "${name}" scaffolded in ${workspaceFolder.name}.`
        );
        a2aProvider.refresh();
      } catch (error) {
        recordAuditEvent({
          surface: 'cli',
          operation: 'scaffold_agent',
          outcome: 'failure',
          target: targetPath,
          detail: adapter,
        });
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
