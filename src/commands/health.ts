import * as vscode from 'vscode';
import type { HealthProvider } from '../panels/health/HealthProvider';
import { COMMAND_IDS } from '../constants';
import { requireWorkspaceTrust } from '../utils/workspaceTrust';

export function registerHealthCommands(
  context: vscode.ExtensionContext,
  healthProvider: HealthProvider
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand(COMMAND_IDS.HEALTH_REFRESH, async () => {
      if (!(await requireWorkspaceTrust('Refreshing Orbit health data'))) return;
      await healthProvider.refresh();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(COMMAND_IDS.HEALTH_ADD_SERVER, async () => {
      if (!(await requireWorkspaceTrust('Registering an MCP server'))) return;

      const name = await vscode.window.showInputBox({
        prompt: 'Enter MCP server name',
        placeHolder: 'my-server',
      });
      if (!name) return;

      const url = await vscode.window.showInputBox({
        prompt: `Enter URL for ${name}`,
        placeHolder: 'http://127.0.0.1:8080',
        value: 'http://127.0.0.1:',
      });
      if (!url) return;

      try {
        await healthProvider.getClient().registerServer(name, url);
        vscode.window.showInformationMessage(`Server "${name}" registered.`);
        await healthProvider.refresh();
      } catch (error) {
        vscode.window.showErrorMessage(
          `Failed to register server: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(COMMAND_IDS.HEALTH_REMOVE_SERVER, async (item) => {
      if (!(await requireWorkspaceTrust('Removing an MCP server'))) return;

      const serverName =
        item?.label ??
        (await vscode.window.showInputBox({
          prompt: 'Enter server name to remove',
        }));
      if (!serverName) return;

      const confirm = await vscode.window.showQuickPick(['Yes', 'No'], {
        placeHolder: `Remove server "${serverName}"?`,
      });
      if (confirm !== 'Yes') return;

      try {
        await healthProvider.getClient().unregisterServer(serverName);
        vscode.window.showInformationMessage(`Server "${serverName}" removed.`);
        await healthProvider.refresh();
      } catch (error) {
        vscode.window.showErrorMessage(
          `Failed to remove server: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(COMMAND_IDS.HEALTH_CHECK_ALL, async () => {
      if (!(await requireWorkspaceTrust('Running health checks'))) return;

      try {
        await healthProvider.getClient().checkAll();
        await healthProvider.refresh();
        vscode.window.showInformationMessage('Health check completed for all servers.');
      } catch (error) {
        vscode.window.showErrorMessage(
          `Health check failed: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(COMMAND_IDS.HEALTH_OPEN_DETAIL, (item) => {
      const serverName = item?.label ?? item?.serverName;
      if (serverName) {
        healthProvider.openDetailWebview(serverName);
      }
    })
  );
}
