import * as assert from 'node:assert';
import * as Module from 'node:module';
import { COMMAND_IDS } from '../../src/constants';
import { PublicNetworkPolicyError } from '../../src/utils/publicJsonFetch';
import type * as A2ACommandsModule from '../../src/commands/a2a';
import type * as DebugCommandsModule from '../../src/commands/debug';
import type * as HealthCommandsModule from '../../src/commands/health';
import type * as McpCommandsModule from '../../src/commands/mcp';
import type * as SecretsModule from '../../src/secrets';

type CommandCallback = (...args: unknown[]) => unknown;
type LoadFunction = (request: string, parent: NodeModule | null, isMain: boolean) => unknown;
type ModuleWithLoad = typeof Module & { _load: LoadFunction };
type Disposable = { dispose(): void };
type ExtensionContext = {
  subscriptions: Disposable[];
  secrets: { store(key: string, value: string): Promise<void>; delete(key: string): Promise<void> };
};

const moduleWithLoad = Module as unknown as ModuleWithLoad;
const originalLoad = moduleWithLoad._load;
const registeredCommands = new Map<string, CommandCallback>();
const auditLines: string[] = [];
const executedCommands: string[] = [];
const errorMessages: string[] = [];
const informationMessages: string[] = [];
const inputBoxResponses: Array<string | undefined> = [];
const quickPickResponses: unknown[] = [];
const warningMessages: string[] = [];

const vscodeMock = {
  Diagnostic: class {
    source = '';

    constructor(
      public readonly range: unknown,
      public readonly message: string,
      public readonly severity: number
    ) {}
  },
  DiagnosticSeverity: {
    Error: 1,
  },
  Range: class {
    constructor(
      public readonly startLine: number,
      public readonly startCharacter: number,
      public readonly endLine: number,
      public readonly endCharacter: number
    ) {}
  },
  commands: {
    executeCommand: (command: string): Promise<void> => {
      executedCommands.push(command);
      return Promise.resolve();
    },
    registerCommand: (command: string, callback: CommandCallback): Disposable => {
      registeredCommands.set(command, callback);
      return { dispose: (): void => undefined };
    },
  },
  env: {
    clipboard: {
      readText: async (): Promise<string> => '',
    },
  },
  workspace: {
    isTrusted: true,
    fs: {
      readFile: async (): Promise<Uint8Array> =>
        Buffer.from(JSON.stringify({ name: 'agent' }), 'utf8'),
    },
    getWorkspaceFolder: (): undefined => undefined,
  },
  window: {
    createOutputChannel: (): { appendLine(value: string): void; dispose(): void } => ({
      appendLine: (value: string): void => {
        auditLines.push(value);
      },
      dispose: (): void => undefined,
    }),
    showErrorMessage: (message: string): void => {
      errorMessages.push(message);
    },
    showInformationMessage: (message: string): void => {
      informationMessages.push(message);
    },
    showInputBox: async (): Promise<string | undefined> => inputBoxResponses.shift(),
    showQuickPick: async (): Promise<unknown> => quickPickResponses.shift(),
    showWarningMessage: (message: string): void => {
      warningMessages.push(message);
    },
  },
};

moduleWithLoad._load = function load(request, parent, isMain): unknown {
  if (request === 'vscode') return vscodeMock;
  return originalLoad.call(this, request, parent, isMain);
};

let registerA2ACommands: typeof A2ACommandsModule.registerA2ACommands;
let registerDebugCommands: typeof DebugCommandsModule.registerDebugCommands;
let registerHealthCommands: typeof HealthCommandsModule.registerHealthCommands;
let registerMcpCommands: typeof McpCommandsModule.registerMcpCommands;
let registerSecretCommands: typeof SecretsModule.registerSecretCommands;

function createContext(): ExtensionContext {
  return {
    subscriptions: [],
    secrets: {
      store: async (): Promise<void> => undefined,
      delete: async (): Promise<void> => undefined,
    },
  };
}

function resetRegistrations(): void {
  registeredCommands.clear();
  auditLines.length = 0;
  executedCommands.length = 0;
  errorMessages.length = 0;
  informationMessages.length = 0;
  inputBoxResponses.length = 0;
  quickPickResponses.length = 0;
  warningMessages.length = 0;
}

function commandList(): string[] {
  return Array.from(registeredCommands.keys()).sort();
}

function callback(command: string): CommandCallback {
  const registered = registeredCommands.get(command);
  assert.ok(registered, `${command} should be registered`);
  return registered;
}

suite('Command Contracts', () => {
  suiteSetup(async () => {
    ({ registerA2ACommands } = await import('../../src/commands/a2a'));
    ({ registerDebugCommands } = await import('../../src/commands/debug'));
    ({ registerHealthCommands } = await import('../../src/commands/health'));
    ({ registerMcpCommands } = await import('../../src/commands/mcp'));
    ({ registerSecretCommands } = await import('../../src/secrets'));
  });

  teardown(() => resetRegistrations());

  suiteTeardown(() => {
    moduleWithLoad._load = originalLoad;
  });

  test('Should register all contributed command IDs', () => {
    const context = createContext();

    registerHealthCommands(context as never, { refresh: (): void => undefined } as never);
    registerDebugCommands(context as never, { refresh: (): void => undefined } as never);
    registerA2ACommands(context as never, { refresh: (): void => undefined } as never);
    registerMcpCommands(
      context as never,
      { refresh: async (): Promise<void> => undefined } as never
    );
    registerSecretCommands(context as never, (): void => undefined);

    assert.deepStrictEqual(commandList(), Object.values(COMMAND_IDS).sort());
    assert.strictEqual(context.subscriptions.length, Object.values(COMMAND_IDS).length);
  });

  test('Should wire refresh commands to provider refresh behavior', async () => {
    let healthRefreshes = 0;
    let debugRefreshes = 0;
    let a2aRefreshes = 0;
    let mcpRefreshes = 0;

    registerHealthCommands(
      createContext() as never,
      {
        refresh: (): void => {
          healthRefreshes += 1;
        },
      } as never
    );
    registerDebugCommands(
      createContext() as never,
      {
        refresh: (): void => {
          debugRefreshes += 1;
        },
      } as never
    );
    registerA2ACommands(
      createContext() as never,
      {
        refresh: (): void => {
          a2aRefreshes += 1;
        },
      } as never
    );
    registerMcpCommands(
      createContext() as never,
      {
        refresh: async (): Promise<void> => {
          mcpRefreshes += 1;
        },
      } as never
    );

    callback(COMMAND_IDS.HEALTH_REFRESH)();
    callback(COMMAND_IDS.DEBUG_REFRESH)();
    callback(COMMAND_IDS.A2A_REFRESH)();
    await callback(COMMAND_IDS.MCP_EXPLORER_REFRESH)();

    assert.strictEqual(healthRefreshes, 1);
    assert.strictEqual(debugRefreshes, 1);
    assert.strictEqual(a2aRefreshes, 1);
    assert.strictEqual(mcpRefreshes, 1);
  });

  test('Should execute Health command success paths', async () => {
    const calls: string[] = [];
    let refreshes = 0;
    const provider = {
      checkAll: async (): Promise<void> => {
        calls.push('checkAll');
      },
      registerServer: async (name: string, url: string): Promise<void> => {
        calls.push(`register:${name}:${url}`);
      },
      unregisterServer: async (name: string): Promise<void> => {
        calls.push(`unregister:${name}`);
      },
      openDetailWebview: (serverName: string): void => {
        calls.push(`detail:${serverName}`);
      },
      refresh: (): void => {
        refreshes += 1;
      },
    };
    registerHealthCommands(createContext() as never, provider as never);

    inputBoxResponses.push('api', 'http://127.0.0.1:8080');
    await callback(COMMAND_IDS.HEALTH_ADD_SERVER)();
    quickPickResponses.push('Yes');
    await callback(COMMAND_IDS.HEALTH_REMOVE_SERVER)({ label: 'api' });
    await callback(COMMAND_IDS.HEALTH_CHECK_ALL)();
    callback(COMMAND_IDS.HEALTH_OPEN_DETAIL)({ label: 'api' });

    assert.deepStrictEqual(calls, [
      'register:api:http://127.0.0.1:8080',
      'unregister:api',
      'checkAll',
      'detail:api',
    ]);
    assert.strictEqual(refreshes, 0);
    assert.strictEqual(informationMessages.length, 3);
  });

  test('Should execute Debug command success paths', async () => {
    const calls: string[] = [];
    const provider = {
      getClient: () => ({
        closeSession: async (sessionId: string): Promise<void> => {
          calls.push(`close:${sessionId}`);
        },
        recordCommand: async (sessionId: string, command: string): Promise<void> => {
          calls.push(`record:${sessionId}:${command}`);
        },
        searchSessions: async (query: string): Promise<unknown> => {
          calls.push(`search:${query}`);
          return {
            sessions: [{ errorText: 'stack', id: 'session-1', status: 'open', title: 'Fix' }],
            total: 1,
          };
        },
        startDebugSession: async (title: string): Promise<void> => {
          calls.push(`start:${title}`);
        },
      }),
      openDetailWebview: (sessionId: string): void => {
        calls.push(`detail:${sessionId}`);
      },
      refresh: (): void => {
        calls.push('refresh');
      },
    };
    registerDebugCommands(createContext() as never, provider as never);

    inputBoxResponses.push('Fix auth');
    await callback(COMMAND_IDS.DEBUG_NEW_SESSION)();
    quickPickResponses.push('Yes');
    await callback(COMMAND_IDS.DEBUG_CLOSE_SESSION)({ sessionId: 'session-1' });
    inputBoxResponses.push('auth');
    quickPickResponses.push({ sessionId: 'session-1' });
    await callback(COMMAND_IDS.DEBUG_SEARCH)();
    callback(COMMAND_IDS.DEBUG_OPEN_SESSION)({ id: 'session-2' });
    inputBoxResponses.push('pnpm test', 'session-1');
    await callback(COMMAND_IDS.DEBUG_RECORD_COMMAND)();

    assert.deepStrictEqual(calls, [
      'start:Fix auth',
      'refresh',
      'close:session-1',
      'refresh',
      'search:auth',
      'detail:session-1',
      'detail:session-2',
      'record:session-1:pnpm test',
    ]);
  });

  test('Should execute A2A command success paths', async () => {
    const diagnosticSets: unknown[] = [];
    const calls: string[] = [];
    const provider = {
      getClient: () => ({
        inspectAgentCard: async (url: string): Promise<unknown> => {
          calls.push(`inspect:${url}`);
          return {
            card: { description: 'desc', name: 'agent', skills: [], version: '1.0.0' },
            trust: {
              reason: 'no_signatures',
              signatureCount: 0,
              state: 'unsigned',
              summary: 'Agent Card is unsigned.',
            },
            validation: { errors: [], valid: true },
          };
        },
        validateAgentCard: async (filePath: string): Promise<unknown> => {
          calls.push(`validate:${filePath}`);
          return { errors: [], valid: true };
        },
      }),
      inspectAgentCardText: async (): Promise<unknown> => ({
        card: { name: 'agent' },
        trust: {
          reason: 'no_signatures',
          signatureCount: 0,
          state: 'unsigned',
          summary: 'Agent Card is unsigned.',
        },
        validation: { errors: [], valid: true },
      }),
      updateDocumentDiagnostics: (): void => {
        diagnosticSets.push([]);
      },
      openDetailWebview: (agentName: string): void => {
        calls.push(`detail:${agentName}`);
      },
      openDetailWebviewFromInspection: (inspection: { card: { name: string } }): void => {
        calls.push(`card:${inspection.card.name}`);
      },
      refresh: (): void => {
        calls.push('refresh');
      },
    };
    registerA2ACommands(createContext() as never, provider as never);

    await callback(COMMAND_IDS.A2A_VALIDATE)({ fsPath: 'agent-card.json' });
    inputBoxResponses.push('https://example.com/agent.json');
    await callback(COMMAND_IDS.A2A_DISCOVER)();
    callback(COMMAND_IDS.A2A_OPEN_CARD)({ label: 'agent' });

    assert.strictEqual(diagnosticSets.length, 1);
    assert.deepStrictEqual(calls, [
      'validate:agent-card.json',
      'inspect:https://example.com/agent.json',
      'card:agent',
      'detail:agent',
    ]);
    assert.strictEqual(informationMessages.length, 2);
  });

  test('Should audit Agent Card network policy blocks without leaking URL secrets', async () => {
    registerA2ACommands(
      createContext() as never,
      {
        getClient: () => ({
          inspectAgentCard: async (): Promise<never> => {
            throw new PublicNetworkPolicyError(
              'blocked_address',
              'Agent Card hostname resolved to a non-public address.'
            );
          },
        }),
      } as never
    );

    inputBoxResponses.push('https://agent.example/card.json?token=secret');
    await callback(COMMAND_IDS.A2A_DISCOVER)();

    const blockedAudit = auditLines.find(
      (line) => line.includes('operation=discover_agent_card') && line.includes('outcome=blocked')
    );
    assert.ok(blockedAudit, 'policy block should be audited as blocked');
    assert.match(blockedAudit, /detail=blocked_address/);
    assert.ok(!blockedAudit.includes('secret'));
  });

  test('Should surface MCP refresh failures', async () => {
    registerMcpCommands(
      createContext() as never,
      {
        refresh: async (): Promise<void> => {
          throw new Error('mcp down');
        },
      } as never
    );

    await callback(COMMAND_IDS.MCP_EXPLORER_REFRESH)();

    assert.match(errorMessages[0] ?? '', /mcp down/);
  });
});
