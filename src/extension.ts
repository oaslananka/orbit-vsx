import * as vscode from 'vscode';
import { HealthProvider } from './panels/health/HealthProvider';
import { HealthStore } from './panels/health/HealthStore';
import { DebugProvider } from './panels/debug/DebugProvider';
import { A2AProvider } from './panels/a2a/A2AProvider';
import { StatusBarController } from './statusbar/StatusBarController';
import { registerHealthCommands } from './commands/health';
import { registerDebugCommands } from './commands/debug';
import { registerA2ACommands } from './commands/a2a';
import { registerMcpCommands } from './commands/mcp';
import { McpExplorerProvider } from './panels/mcp/McpExplorerProvider';
import { DebugDecorationProvider } from './decorations/DebugDecorationProvider';
import { Logger } from './utils/logger';
import { readConfig } from './config';
import { initializeOrbitSecrets, registerSecretCommands } from './secrets';
import { isWorkspaceTrusted } from './utils/workspaceTrust';

interface StartupRefreshProvider {
  refresh(): Promise<void> | void;
}

/**
 * Starts the initial tree provider refreshes after views and listeners are registered.
 */
export function refreshStartupProviders(
  logger: Pick<Logger, 'warn'>,
  ...providers: StartupRefreshProvider[]
): void {
  providers.forEach((provider) => {
    Promise.resolve()
      .then(() => provider.refresh())
      .catch((error) => {
        const message = error instanceof Error ? error.message : String(error);
        logger.warn(`Startup provider refresh failed: ${message}`);
      });
  });
}

export function activate(context: vscode.ExtensionContext): void {
  const logger = new Logger('Orbit');
  logger.info('Orbit activated');

  const config = readConfig();

  const healthStore = new HealthStore();
  const healthProvider = new HealthProvider(context, healthStore);
  const debugProvider = new DebugProvider(context);
  const a2aProvider = new A2AProvider(context);
  const mcpProvider = new McpExplorerProvider(healthStore);
  const statusBar = new StatusBarController(healthProvider);

  const healthTree = vscode.window.createTreeView('orbit.health', {
    treeDataProvider: healthProvider,
    showCollapseAll: false,
  });
  const debugTree = vscode.window.createTreeView('orbit.debug', {
    treeDataProvider: debugProvider,
    showCollapseAll: true,
  });
  const a2aTree = vscode.window.createTreeView('orbit.a2a', {
    treeDataProvider: a2aProvider,
    showCollapseAll: true,
  });
  const mcpTree = vscode.window.createTreeView('orbit.mcp.explorer', {
    treeDataProvider: mcpProvider,
    showCollapseAll: false,
  });

  const updateViewDescriptions = (): void => {
    healthTree.description = `${healthProvider.getCount()} server${healthProvider.getCount() !== 1 ? 's' : ''}`;
    debugTree.description = `${debugProvider.getCount()} session${debugProvider.getCount() !== 1 ? 's' : ''}`;
    a2aTree.description = `${a2aProvider.getCount()} agent${a2aProvider.getCount() !== 1 ? 's' : ''}`;
    mcpTree.description = `${mcpProvider.getCount()} connection${mcpProvider.getCount() !== 1 ? 's' : ''}`;
  };

  const guard = <T>(fn: () => T): void => {
    try {
      fn();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.warn(`Failed to update view descriptions: ${message}`);
    }
  };
  healthProvider.onDidChangeTreeData(() => guard(updateViewDescriptions));
  debugProvider.onDidChangeTreeData(() => guard(updateViewDescriptions));
  a2aProvider.onDidChangeTreeData(() => guard(updateViewDescriptions));
  mcpProvider.onDidChangeTreeData(() => guard(updateViewDescriptions));

  context.subscriptions.push(
    healthStore,
    healthProvider,
    debugProvider,
    a2aProvider,
    mcpProvider,
    healthTree,
    debugTree,
    a2aTree,
    mcpTree
  );

  refreshStartupProviders(logger, healthProvider, debugProvider, a2aProvider, mcpProvider);

  registerHealthCommands(context, healthProvider);
  registerDebugCommands(context, debugProvider);
  registerA2ACommands(context, a2aProvider);
  registerMcpCommands(context, mcpProvider);
  const refreshSecretBackedClients = (): void => {
    healthProvider.onConfigChanged();
    debugProvider.onConfigChanged();
    mcpProvider.onConfigChanged();
    statusBar.onConfigChanged();
  };

  registerSecretCommands(context, refreshSecretBackedClients);

  initializeOrbitSecrets(context.secrets)
    .then(refreshSecretBackedClients)
    .catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      logger.warn(`Failed to initialize Orbit SecretStorage: ${message}`);
    });

  statusBar.start();

  if (config.debug.showEditorDecorations) {
    const decorationProvider = new DebugDecorationProvider(debugProvider.getClient());
    context.subscriptions.push(decorationProvider);
  }

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

  context.subscriptions.push(
    vscode.workspace.onDidGrantWorkspaceTrust(() => {
      logger.info('Workspace trust granted; refreshing Orbit providers');
      healthProvider.onConfigChanged();
      debugProvider.onConfigChanged();
      a2aProvider.onConfigChanged();
      mcpProvider.onConfigChanged();
      statusBar.onConfigChanged();
    })
  );

  if (config.a2a.autoValidateOnSave) {
    const validateAgentCard = (document: vscode.TextDocument): void => {
      if (!/agent-card\.json$/.test(document.fileName) || !isWorkspaceTrusted()) return;
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
          a2aProvider.getDiagnosticCollection().delete(uri);
        });
    };

    context.subscriptions.push(vscode.workspace.onDidSaveTextDocument(validateAgentCard));
  }

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('orbit')) {
        logger.info('Configuration changed');
        healthProvider.onConfigChanged();
        debugProvider.onConfigChanged();
        a2aProvider.onConfigChanged();
        mcpProvider.onConfigChanged();
        statusBar.onConfigChanged();
      }
    }),
    statusBar,
    logger
  );
}

export function deactivate(): void {}
