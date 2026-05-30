import * as vscode from 'vscode';
import { HealthProvider } from './panels/health/HealthProvider';
import { DebugProvider } from './panels/debug/DebugProvider';
import { A2AProvider } from './panels/a2a/A2AProvider';
import { StatusBarController } from './statusbar/StatusBarController';
import { registerHealthCommands } from './commands/health';
import { registerDebugCommands } from './commands/debug';
import { registerA2ACommands } from './commands/a2a';
import { registerSessionCommands } from './commands/sessions';
import { Logger } from './utils/logger';
import { readConfig } from './config';

export function activate(context: vscode.ExtensionContext): void {
  const logger = new Logger('Orbit');
  logger.info('Orbit activated');

  const config = readConfig();

  const healthProvider = new HealthProvider(context);
  const debugProvider = new DebugProvider(context);
  const a2aProvider = new A2AProvider(context);
  const statusBar = new StatusBarController(healthProvider);

  context.subscriptions.push(
    vscode.window.registerTreeDataProvider('orbit.health', healthProvider),
    vscode.window.registerTreeDataProvider('orbit.debug', debugProvider),
    vscode.window.registerTreeDataProvider('orbit.a2a', a2aProvider)
  );

  registerHealthCommands(context, healthProvider);
  registerDebugCommands(context, debugProvider);
  registerA2ACommands(context, a2aProvider);
  registerSessionCommands(context);

  statusBar.start();

  if (config.debug.autoTrackVscodeSessions) {
    context.subscriptions.push(
      vscode.debug.onDidStartDebugSession((session) => {
        logger.info(`VS Code debug session started: ${session.name}`);
        debugProvider
          .getClient()
          .startDebugSession(session.name)
          .catch((err) => {
            logger.warn(`Failed to auto-track debug start: ${err.message}`);
          });
      }),
      vscode.debug.onDidTerminateDebugSession((session) => {
        logger.info(`VS Code debug session terminated: ${session.name}`);
      })
    );
  }

  if (config.a2a.autoValidateOnSave) {
    context.subscriptions.push(
      vscode.workspace.onDidSaveTextDocument((document) => {
        if (/agent-card\.json$/.test(document.fileName)) {
          const uri = document.uri;
          a2aProvider
            .getClient()
            .validateAgentCard(uri.fsPath)
            .then((result) => {
              const diagnostics: vscode.Diagnostic[] = result.errors.map((msg) => {
                const diag = new vscode.Diagnostic(
                  new vscode.Range(0, 0, 0, document.lineCount - 1),
                  msg,
                  vscode.DiagnosticSeverity.Error
                );
                diag.source = 'Orbit A2A';
                return diag;
              });
              a2aProvider.getDiagnosticCollection().set(uri, diagnostics);
            })
            .catch(() => {
              // CLI not found or other error — clear diagnostics
              a2aProvider.getDiagnosticCollection().delete(uri);
            });
        }
      })
    );
  }

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('orbit')) {
        logger.info('Configuration changed');
        healthProvider.onConfigChanged();
        debugProvider.onConfigChanged();
        a2aProvider.onConfigChanged();
        statusBar.onConfigChanged();
      }
    }),
    statusBar,
    logger
  );
}

export function deactivate(): void {
  // Cleanup handled by context.subscriptions disposables
}
