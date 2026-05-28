import * as vscode from 'vscode';
import { CONFIG_KEYS } from './constants';

export interface OrbitConfig {
  health: {
    endpoint: string;
    token: string;
    pollingIntervalSeconds: number;
    enabled: boolean;
  };
  debug: {
    endpoint: string;
    token: string;
    enabled: boolean;
    maxSessionsShown: number;
    autoTrackVscodeSessions: boolean;
  };
  a2a: {
    registryUrl: string;
    cliPath: string;
    enabled: boolean;
    autoValidateOnSave: boolean;
  };
}

export function readConfig(): OrbitConfig {
  const config = vscode.workspace.getConfiguration('orbit');
  return {
    health: {
      endpoint: config.get<string>(CONFIG_KEYS.HEALTH_ENDPOINT, 'http://127.0.0.1:3000'),
      token: config.get<string>(CONFIG_KEYS.HEALTH_TOKEN, ''),
      pollingIntervalSeconds: config.get<number>(CONFIG_KEYS.HEALTH_POLLING_INTERVAL, 30),
      enabled: config.get<boolean>(CONFIG_KEYS.HEALTH_ENABLED, true),
    },
    debug: {
      endpoint: config.get<string>(CONFIG_KEYS.DEBUG_ENDPOINT, 'http://127.0.0.1:3001'),
      token: config.get<string>(CONFIG_KEYS.DEBUG_TOKEN, ''),
      enabled: config.get<boolean>(CONFIG_KEYS.DEBUG_ENABLED, true),
      maxSessionsShown: config.get<number>(CONFIG_KEYS.DEBUG_MAX_SESSIONS, 50),
      autoTrackVscodeSessions: config.get<boolean>(CONFIG_KEYS.DEBUG_AUTO_TRACK, false),
    },
    a2a: {
      registryUrl: config.get<string>(CONFIG_KEYS.A2A_REGISTRY_URL, 'http://127.0.0.1:3099'),
      cliPath: config.get<string>(CONFIG_KEYS.A2A_CLI_PATH, 'a2a-warp'),
      enabled: config.get<boolean>(CONFIG_KEYS.A2A_ENABLED, true),
      autoValidateOnSave: config.get<boolean>(CONFIG_KEYS.A2A_AUTO_VALIDATE, true),
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
