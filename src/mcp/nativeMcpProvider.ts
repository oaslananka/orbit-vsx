import * as vscode from 'vscode';
import { readConfig } from '../config';
import { MCP_SERVER_DEFINITION_PROVIDER_ID } from '../constants';
import { recordAuditEvent } from '../utils/audit';
import { joinUrl, redactUrl } from '../utils/urlSafety';
import { isWorkspaceTrusted } from '../utils/workspaceTrust';

type McpServerDefinition = unknown;
type McpHttpServerDefinitionOptions = {
  label: string;
  uri: string;
  headers?: Record<string, string>;
  version?: string;
};
type McpHttpServerDefinitionConstructor = new (
  options: McpHttpServerDefinitionOptions
) => McpServerDefinition;
type McpServerDefinitionProvider = {
  onDidChangeMcpServerDefinitions: vscode.Event<void>;
  provideMcpServerDefinitions: () => McpServerDefinition[];
  resolveMcpServerDefinition: (definition: McpServerDefinition) => McpServerDefinition | undefined;
};
type VsCodeMcpRuntime = typeof vscode & {
  lm?: {
    registerMcpServerDefinitionProvider?: (
      providerId: string,
      provider: McpServerDefinitionProvider
    ) => vscode.Disposable;
  };
  McpHttpServerDefinition?: McpHttpServerDefinitionConstructor;
};

export class OrbitMcpServerDefinitionProvider implements vscode.Disposable {
  private readonly didChangeEmitter = new vscode.EventEmitter<void>();
  private readonly registration: vscode.Disposable | undefined;

  constructor(runtime: VsCodeMcpRuntime = vscode as VsCodeMcpRuntime) {
    const register = runtime.lm?.registerMcpServerDefinitionProvider;
    if (typeof register !== 'function') return;

    this.registration = register(MCP_SERVER_DEFINITION_PROVIDER_ID, {
      onDidChangeMcpServerDefinitions: this.didChangeEmitter.event,
      provideMcpServerDefinitions: () => this.provideDefinitions(runtime),
      resolveMcpServerDefinition: (definition) => definition,
    });
  }

  get isRegistered(): boolean {
    return this.registration !== undefined;
  }

  onConfigChanged(): void {
    this.didChangeEmitter.fire();
  }

  dispose(): void {
    this.registration?.dispose();
    this.didChangeEmitter.dispose();
  }

  private provideDefinitions(runtime: VsCodeMcpRuntime): McpServerDefinition[] {
    const httpDefinition = runtime.McpHttpServerDefinition;
    if (typeof httpDefinition !== 'function' || !isWorkspaceTrusted()) return [];

    const config = readConfig();
    const definitions: McpServerDefinition[] = [];
    if (config.health.enabled) {
      definitions.push(
        new httpDefinition(
          httpDefinitionOptions(
            'Orbit Health Monitor MCP',
            joinUrl(config.health.endpoint, '/mcp'),
            config.health.token
          )
        )
      );
    }
    if (config.debug.enabled) {
      definitions.push(
        new httpDefinition(
          httpDefinitionOptions(
            'Orbit Debug Recorder MCP',
            joinUrl(config.debug.endpoint, '/mcp'),
            config.debug.token
          )
        )
      );
    }

    recordAuditEvent({
      detail: String(definitions.length),
      operation: 'provide_mcp_server_definitions',
      outcome: 'success',
      surface: 'mcp',
      target: definitions.map((definition) => redactDefinitionUri(definition)).join(','),
    });
    return definitions;
  }
}

export function registerNativeMcpProvider(
  context: vscode.ExtensionContext
): OrbitMcpServerDefinitionProvider {
  const provider = new OrbitMcpServerDefinitionProvider();
  context.subscriptions.push(provider);
  return provider;
}

function httpDefinitionOptions(
  label: string,
  uri: string,
  token: string
): McpHttpServerDefinitionOptions {
  const headers = bearerHeaders(token);
  const options: McpHttpServerDefinitionOptions = { label, uri, version: '0.5.7' };
  if (headers) options.headers = headers;
  return options;
}

function bearerHeaders(token: string): Record<string, string> | undefined {
  if (!token) return undefined;
  return { Authorization: `Bearer ${token}` };
}

function redactDefinitionUri(definition: unknown): string {
  const value = definition as { uri?: unknown };
  return typeof value.uri === 'string' ? redactUrl(value.uri) : 'unknown';
}
