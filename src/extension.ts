import * as vscode from 'vscode';
import { HealthProvider } from './panels/health/HealthProvider';
import { HealthStore } from './panels/health/HealthStore';
import { DebugProvider } from './panels/debug/DebugProvider';
import { DebugSessionTracker } from './panels/debug/DebugSessionTracker';
import { DebugIntegrationController } from './panels/debug/DebugIntegrationController';
import { A2AProvider } from './panels/a2a/A2AProvider';
import { StatusBarController } from './statusbar/StatusBarController';
import { registerHealthCommands } from './commands/health';
import { registerDebugCommands } from './commands/debug';
import { registerA2ACommands } from './commands/a2a';
import { registerMcpCommands } from './commands/mcp';
import { McpExplorerProvider } from './panels/mcp/McpExplorerProvider';
import { DebugDecorationProvider } from './decorations/DebugDecorationProvider';
import { Logger } from './utils/logger';
import { disposeAuditChannel } from './utils/audit';
import { readConfig } from './config';
import { initializeOrbitSecrets, registerSecretCommands } from './secrets';
import { isWorkspaceTrusted } from './utils/workspaceTrust';
import { registerNativeMcpProvider } from './mcp/nativeMcpProvider';
import { registerOrbitLanguageModelTools } from './lm/orbitTools';

let activeDebugIntegrationController: DebugIntegrationController | undefined;

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
  context.subscriptions.push({ dispose: disposeAuditChannel });
  logger.info('Orbit activated');

  const config = readConfig();

  const healthStore = new HealthStore();
  const healthProvider = new HealthProvider(context, healthStore);
  const debugProvider = new DebugProvider(context);
  const a2aProvider = new A2AProvider(context);
  const mcpProvider = new McpExplorerProvider(healthStore);
  const statusBar = new StatusBarController(healthProvider);
  const nativeMcpProvider = registerNativeMcpProvider(context);
  const debugIntegrations = new DebugIntegrationController({
    createDecorations: () => new DebugDecorationProvider(() => debugProvider.getClient()),
    createTracker: () =>
      new DebugSessionTracker(
        () => debugProvider.getClient(),
        logger,
        () => debugProvider.refresh()
      ),
    onDidStartDebugSession: (callback) =>
      vscode.debug.onDidStartDebugSession((session) => {
        callback({ id: session.id, name: session.name });
      }),
    onDidTerminateDebugSession: (callback) =>
      vscode.debug.onDidTerminateDebugSession((session) => {
        callback({ id: session.id, name: session.name });
      }),
  });
  activeDebugIntegrationController = debugIntegrations;

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
    debugIntegrations,
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
  registerOrbitLanguageModelTools(context, { a2aProvider, debugProvider, healthProvider });
  const refreshSecretBackedClients = (): void => {
    healthProvider.onConfigChanged();
    debugProvider.onConfigChanged();
    debugIntegrations.onDebugClientChanged();
    mcpProvider.onConfigChanged();
    statusBar.onConfigChanged();
    nativeMcpProvider.onConfigChanged();
  };

  registerSecretCommands(context, refreshSecretBackedClients);

  initializeOrbitSecrets(context.secrets)
    .then(refreshSecretBackedClients)
    .catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      logger.warn(`Failed to initialize Orbit SecretStorage: ${message}`);
    });

  statusBar.start();
  debugIntegrations.reconcile(config.debug);

  context.subscriptions.push(
    vscode.workspace.onDidGrantWorkspaceTrust(() => {
      logger.info('Workspace trust granted; refreshing Orbit providers');
      healthProvider.onConfigChanged();
      debugProvider.onConfigChanged();
      debugIntegrations.onDebugClientChanged();
      a2aProvider.onConfigChanged();
      mcpProvider.onConfigChanged();
      statusBar.onConfigChanged();
      nativeMcpProvider.onConfigChanged();
    })
  );

  if (config.a2a.autoValidateOnSave) {
    const validateAgentCard = (document: vscode.TextDocument): void => {
      if (!/agent-card\.json$/.test(document.fileName) || !isWorkspaceTrusted()) return;
      const uri = document.uri;
      a2aProvider
        .getClient()
        .validateAgentCard(uri.fsPath)
        .then(async (result) => {
          const text = document.getText();
          const inspection = await a2aProvider.inspectAgentCardText(text);
          a2aProvider.updateDocumentDiagnostics(uri, text, inspection, result.errors);
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
        const nextConfig = readConfig();
        healthProvider.onConfigChanged();
        debugProvider.onConfigChanged();
        debugIntegrations.onDebugClientChanged();
        debugIntegrations.reconcile(nextConfig.debug);
        a2aProvider.onConfigChanged();
        mcpProvider.onConfigChanged();
        statusBar.onConfigChanged();
        nativeMcpProvider.onConfigChanged();
      }
    }),
    statusBar,
    logger
  );
}

export async function deactivate(): Promise<void> {
  const controller = activeDebugIntegrationController;
  activeDebugIntegrationController = undefined;
  await controller?.shutdown();
}
