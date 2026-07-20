import * as vscode from 'vscode';
import { readConfig } from '../config';
import { MCP_SERVER_DEFINITION_PROVIDER_ID } from '../constants';
import { recordAuditEvent } from '../utils/audit';
import { joinUrl } from '../utils/urlSafety';
import { isWorkspaceTrusted } from '../utils/workspaceTrust';

type McpServerDefinition = unknown;
type McpHttpServerDefinitionConstructor = new (
  label: string,
  uri: vscode.Uri,
  headers?: Record<string, string>,
  version?: string
) => McpServerDefinition;
type McpServerDefinitionProvider = {
  onDidChangeMcpServerDefinitions: vscode.Event<void>;
  provideMcpServerDefinitions: (token?: vscode.CancellationToken) => McpServerDefinition[];
  resolveMcpServerDefinition: (
    definition: McpServerDefinition,
    token?: vscode.CancellationToken
  ) => McpServerDefinition | undefined;
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

  constructor(
    runtime: VsCodeMcpRuntime = vscode as VsCodeMcpRuntime,
    private readonly extensionVersion = 'unknown'
  ) {
    const register = runtime.lm?.registerMcpServerDefinitionProvider;
    if (typeof register !== 'function') return;

    try {
      this.registration = register(MCP_SERVER_DEFINITION_PROVIDER_ID, {
        onDidChangeMcpServerDefinitions: this.didChangeEmitter.event,
        provideMcpServerDefinitions: () => this.provideDefinitions(runtime),
        resolveMcpServerDefinition: (definition) => definition,
      });
    } catch (error) {
      recordAuditEvent({
        detail: error instanceof Error ? error.message : String(error),
        operation: 'register_mcp_definition_provider',
        outcome: 'blocked',
        surface: 'mcp',
      });
    }
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
          'Orbit Health Monitor MCP',
          runtime.Uri.parse(joinUrl(config.health.endpoint, '/mcp')),
          bearerHeaders(config.health.token),
          this.extensionVersion
        )
      );
    }
    if (config.debug.enabled) {
      definitions.push(
        new httpDefinition(
          'Orbit Debug Recorder MCP',
          runtime.Uri.parse(joinUrl(config.debug.endpoint, '/mcp')),
          bearerHeaders(config.debug.token),
          this.extensionVersion
        )
      );
    }

    recordAuditEvent({
      detail: String(definitions.length),
      operation: 'provide_mcp_server_definitions',
      outcome: 'success',
      surface: 'mcp',
      target: { kind: 'identifier', value: MCP_SERVER_DEFINITION_PROVIDER_ID },
    });
    return definitions;
  }
}

export function registerNativeMcpProvider(
  context: vscode.ExtensionContext
): OrbitMcpServerDefinitionProvider {
  const provider = new OrbitMcpServerDefinitionProvider(
    vscode as VsCodeMcpRuntime,
    extensionVersionFromContext(context)
  );
  context.subscriptions.push(provider);
  return provider;
}

function extensionVersionFromContext(context: vscode.ExtensionContext): string {
  const packageJson = context.extension.packageJSON as { version?: unknown };
  return typeof packageJson.version === 'string' && packageJson.version.trim().length > 0
    ? packageJson.version
    : 'unknown';
}

function bearerHeaders(token: string): Record<string, string> | undefined {
  if (!token) return undefined;
  return { Authorization: `Bearer ${token}` };
}
