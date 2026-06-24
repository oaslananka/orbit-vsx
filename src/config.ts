import * as vscode from 'vscode';
import { CONFIG_KEYS } from './constants';
import { getCachedDebugToken, getCachedHealthToken } from './secrets';
import { normalizeHttpUrl } from './utils/urlSafety';

export interface OrbitConfig {
  health: {
    endpoint: string;
    token: string;
    pollingIntervalSeconds: number;
    enabled: boolean;
    alertOnDown: boolean;
    alertOnRecover: boolean;
  };
  debug: {
    endpoint: string;
    token: string;
    enabled: boolean;
    maxSessionsShown: number;
    autoTrackVscodeSessions: boolean;
    showEditorDecorations: boolean;
  };
  a2a: {
    registryUrl: string;
    cliPath: string;
    enabled: boolean;
    autoValidateOnSave: boolean;
    localCardScanLimit: number;
    localCardExcludeGlob: string;
  };
  mcpExplorer: {
    enabled: boolean;
  };
}

function readHttpEndpoint(
  config: vscode.WorkspaceConfiguration,
  key: string,
  fallback: string,
  label: string
): string {
  const value = config.get<string>(key, fallback);
  return normalizeHttpUrl(value, {
    allowLocalhost: true,
    allowPrivateNetwork: true,
    label,
  });
}

export function readConfig(): OrbitConfig {
  const config = vscode.workspace.getConfiguration('orbit');
  return {
    health: {
      endpoint: readHttpEndpoint(
        config,
        CONFIG_KEYS.HEALTH_ENDPOINT,
        'http://127.0.0.1:3000',
        'Health endpoint'
      ),
      token: getCachedHealthToken(),
      pollingIntervalSeconds: config.get<number>(CONFIG_KEYS.HEALTH_POLLING_INTERVAL, 30),
      enabled: config.get<boolean>(CONFIG_KEYS.HEALTH_ENABLED, true),
      alertOnDown: config.get<boolean>(CONFIG_KEYS.HEALTH_ALERT_ON_DOWN, true),
      alertOnRecover: config.get<boolean>(CONFIG_KEYS.HEALTH_ALERT_ON_RECOVER, false),
    },
    debug: {
      endpoint: readHttpEndpoint(
        config,
        CONFIG_KEYS.DEBUG_ENDPOINT,
        'http://127.0.0.1:3001',
        'Debug endpoint'
      ),
      token: getCachedDebugToken(),
      enabled: config.get<boolean>(CONFIG_KEYS.DEBUG_ENABLED, true),
      maxSessionsShown: config.get<number>(CONFIG_KEYS.DEBUG_MAX_SESSIONS, 50),
      autoTrackVscodeSessions: config.get<boolean>(CONFIG_KEYS.DEBUG_AUTO_TRACK, false),
      showEditorDecorations: config.get<boolean>(CONFIG_KEYS.DEBUG_SHOW_EDITOR_DECORATIONS, true),
    },
    a2a: {
      registryUrl: readHttpEndpoint(
        config,
        CONFIG_KEYS.A2A_REGISTRY_URL,
        'http://127.0.0.1:3099',
        'A2A registry URL'
      ),
      cliPath: config.get<string>(CONFIG_KEYS.A2A_CLI_PATH, 'a2a-warp'),
      enabled: config.get<boolean>(CONFIG_KEYS.A2A_ENABLED, true),
      autoValidateOnSave: config.get<boolean>(CONFIG_KEYS.A2A_AUTO_VALIDATE, true),
      localCardScanLimit: Math.max(
        1,
        Math.min(config.get<number>(CONFIG_KEYS.A2A_LOCAL_CARD_SCAN_LIMIT, 25), 250)
      ),
      localCardExcludeGlob: config.get<string>(
        CONFIG_KEYS.A2A_LOCAL_CARD_EXCLUDE_GLOB,
        '**/{node_modules,.git,dist,out,coverage}/**'
      ),
    },
    mcpExplorer: {
      enabled: config.get<boolean>(CONFIG_KEYS.MCP_EXPLORER_ENABLED, true),
    },
  };
}

export function onConfigChange(handler: (config: OrbitConfig) => void): vscode.Disposable {
  return vscode.workspace.onDidChangeConfiguration((e) => {
    if (e.affectsConfiguration('orbit')) {
      handler(readConfig());
    }
  });
}
