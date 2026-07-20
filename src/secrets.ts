import * as vscode from 'vscode';
import { COMMAND_IDS, CONFIG_KEYS } from './constants';

const HEALTH_TOKEN_SECRET_KEY = 'orbit.health.token';
const DEBUG_TOKEN_SECRET_KEY = 'orbit.debug.token';

interface CachedOrbitSecrets {
  healthToken: string;
  debugToken: string;
}

const cachedSecrets: CachedOrbitSecrets = {
  healthToken: '',
  debugToken: '',
};

export function getCachedHealthToken(): string {
  return cachedSecrets.healthToken;
}

export function getCachedDebugToken(): string {
  return cachedSecrets.debugToken;
}

async function clearLegacyTokenSetting(configKey: string): Promise<void> {
  const rootConfig = vscode.workspace.getConfiguration();
  const rootInspection = rootConfig.inspect<string>(configKey);

  if (rootInspection?.globalValue !== undefined) {
    await rootConfig.update(configKey, undefined, vscode.ConfigurationTarget.Global);
  }
  if (rootInspection?.workspaceValue !== undefined) {
    await rootConfig.update(configKey, undefined, vscode.ConfigurationTarget.Workspace);
  }
  if (rootInspection?.workspaceFolderValue !== undefined) {
    await rootConfig.update(configKey, undefined, vscode.ConfigurationTarget.WorkspaceFolder);
  }

  for (const folder of vscode.workspace.workspaceFolders ?? []) {
    const folderConfig = vscode.workspace.getConfiguration(undefined, folder.uri);
    const folderInspection = folderConfig.inspect<string>(configKey);
    if (folderInspection?.workspaceFolderValue !== undefined) {
      await folderConfig.update(configKey, undefined, vscode.ConfigurationTarget.WorkspaceFolder);
    }
  }
}

async function migrateLegacyToken(
  secrets: vscode.SecretStorage,
  configKey: string,
  secretKey: string,
  assign: (token: string) => void
): Promise<void> {
  const existingSecret = await secrets.get(secretKey);
  if (existingSecret) {
    assign(existingSecret);
    await clearLegacyTokenSetting(configKey);
    return;
  }

  const legacyToken = vscode.workspace.getConfiguration().get<string>(configKey, '').trim();
  if (legacyToken) {
    await secrets.store(secretKey, legacyToken);
  }
  assign(legacyToken);
  await clearLegacyTokenSetting(configKey);
}

export async function initializeOrbitSecrets(secrets: vscode.SecretStorage): Promise<void> {
  await migrateLegacyToken(secrets, CONFIG_KEYS.HEALTH_TOKEN, HEALTH_TOKEN_SECRET_KEY, (token) => {
    cachedSecrets.healthToken = token;
  });
  await migrateLegacyToken(secrets, CONFIG_KEYS.DEBUG_TOKEN, DEBUG_TOKEN_SECRET_KEY, (token) => {
    cachedSecrets.debugToken = token;
  });
}

async function setToken(
  secrets: vscode.SecretStorage,
  configKey: string,
  secretKey: string,
  prompt: string,
  assign: (token: string) => void,
  refresh: () => void
): Promise<void> {
  const token = await vscode.window.showInputBox({
    prompt,
    password: true,
    ignoreFocusOut: true,
    validateInput: (value) => (value.trim().length === 0 ? 'Token cannot be empty.' : undefined),
  });
  if (!token) return;

  await secrets.store(secretKey, token.trim());
  await clearLegacyTokenSetting(configKey);
  assign(token.trim());
  refresh();
  vscode.window.showInformationMessage('Orbit token saved in VS Code SecretStorage.');
}

async function clearToken(
  secrets: vscode.SecretStorage,
  configKey: string,
  secretKey: string,
  assign: (token: string) => void,
  refresh: () => void,
  label: string
): Promise<void> {
  const confirm = await vscode.window.showWarningMessage(
    `Clear the ${label} token from VS Code SecretStorage?`,
    { modal: true },
    'Clear Token'
  );
  if (confirm !== 'Clear Token') return;

  await secrets.delete(secretKey);
  await clearLegacyTokenSetting(configKey);
  assign('');
  refresh();
  vscode.window.showInformationMessage(`${label} token cleared.`);
}

export function registerSecretCommands(
  context: vscode.ExtensionContext,
  refreshClients: () => void
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand(COMMAND_IDS.HEALTH_SET_TOKEN, async () => {
      await setToken(
        context.secrets,
        CONFIG_KEYS.HEALTH_TOKEN,
        HEALTH_TOKEN_SECRET_KEY,
        'Enter bearer token for health-monitor-mcp',
        (token) => {
          cachedSecrets.healthToken = token;
        },
        refreshClients
      );
    }),
    vscode.commands.registerCommand(COMMAND_IDS.HEALTH_CLEAR_TOKEN, async () => {
      await clearToken(
        context.secrets,
        CONFIG_KEYS.HEALTH_TOKEN,
        HEALTH_TOKEN_SECRET_KEY,
        (token) => {
          cachedSecrets.healthToken = token;
        },
        refreshClients,
        'Health'
      );
    }),
    vscode.commands.registerCommand(COMMAND_IDS.DEBUG_SET_TOKEN, async () => {
      await setToken(
        context.secrets,
        CONFIG_KEYS.DEBUG_TOKEN,
        DEBUG_TOKEN_SECRET_KEY,
        'Enter bearer token for debug-recorder-mcp',
        (token) => {
          cachedSecrets.debugToken = token;
        },
        refreshClients
      );
    }),
    vscode.commands.registerCommand(COMMAND_IDS.DEBUG_CLEAR_TOKEN, async () => {
      await clearToken(
        context.secrets,
        CONFIG_KEYS.DEBUG_TOKEN,
        DEBUG_TOKEN_SECRET_KEY,
        (token) => {
          cachedSecrets.debugToken = token;
        },
        refreshClients,
        'Debug'
      );
    })
  );
}
