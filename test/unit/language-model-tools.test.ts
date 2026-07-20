import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as Module from 'node:module';
import type * as OrbitToolsModule from '../../src/lm/orbitTools';

type LoadFunction = (request: string, parent: NodeModule | null, isMain: boolean) => unknown;
type ModuleWithLoad = typeof Module & { _load: LoadFunction };
type Disposable = { dispose(): void };
type Tool = {
  invoke(options: { input: unknown; toolInvocationToken?: unknown }, token?: unknown): unknown;
};

type TextPart = { value: string };
type ToolResult = { content: TextPart[] };

const moduleWithLoad = Module as unknown as ModuleWithLoad;
const originalLoad = moduleWithLoad._load;
const registeredTools = new Map<string, Tool>();

const vscodeMock = {
  LanguageModelTextPart: class {
    constructor(public readonly value: string) {}
  },
  LanguageModelToolResult: class {
    constructor(public readonly content: TextPart[]) {}
  },
  commands: {
    registerCommand: (): Disposable => ({ dispose: (): void => undefined }),
  },
  lm: {
    registerTool: (name: string, tool: Tool): Disposable => {
      registeredTools.set(name, tool);
      return { dispose: (): void => undefined };
    },
  },
  window: {
    createOutputChannel: (): { appendLine: (value: string) => void; dispose: () => void } => ({
      appendLine: (): void => undefined,
      dispose: (): void => undefined,
    }),
  },
  workspace: {
    isTrusted: true,
  },
};

function repoRoot(): string {
  return path.resolve(__dirname, '../..');
}

function resultText(result: unknown): string {
  const value = result as ToolResult;
  return value.content[0]?.value ?? '{}';
}

function parseResult(result: unknown): unknown {
  return JSON.parse(resultText(result));
}

function validAgentCard(): Record<string, unknown> {
  return {
    capabilities: { extendedAgentCard: true, streaming: true },
    defaultInputModes: ['application/json'],
    defaultOutputModes: ['application/json'],
    description: 'Demo agent',
    name: 'demo-agent',
    securityRequirements: [{ schemes: { oidc: { list: ['openid'] } } }],
    securitySchemes: {
      oidc: {
        openIdConnectSecurityScheme: {
          openIdConnectUrl: 'https://accounts.example.com/.well-known/openid-configuration',
        },
      },
    },
    skills: [{ description: 'Demo skill', id: 'demo', name: 'Demo', tags: ['demo'] }],
    supportedInterfaces: [
      { protocolBinding: 'jsonrpc', protocolVersion: '1.0', url: 'https://agent.example.com/a2a' },
    ],
    version: '1.0.0',
  };
}

function unsignedTrust(): Record<string, unknown> {
  return {
    reason: 'no_signatures',
    signatureCount: 0,
    state: 'unsigned',
    summary: 'Agent Card is unsigned.',
  };
}

suite('Language Model Tools', () => {
  let orbitTools: typeof OrbitToolsModule;

  suiteSetup(async () => {
    moduleWithLoad._load = function load(request, parent, isMain): unknown {
      if (request === 'vscode') return vscodeMock;
      return originalLoad.call(this, request, parent, isMain);
    };
    orbitTools = await import('../../src/lm/orbitTools');
  });

  teardown(() => {
    registeredTools.clear();
    vscodeMock.workspace.isTrusted = true;
  });

  suiteTeardown(() => {
    moduleWithLoad._load = originalLoad;
  });

  test('Should keep manifest tool names in sync with registered tools', () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(repoRoot(), 'package.json'), 'utf8')) as {
      contributes?: { languageModelTools?: Array<{ name: string }> };
    };
    const manifestNames = (manifest.contributes?.languageModelTools ?? [])
      .map((tool) => tool.name)
      .sort();
    const codeNames = Object.values(orbitTools.ORBIT_LANGUAGE_MODEL_TOOL_NAMES).sort();

    assert.deepStrictEqual(manifestNames, codeNames);
  });

  test('Should register read-only Orbit tools and return bounded redacted output', async () => {
    const context = { subscriptions: [] as Disposable[] };
    const providers = {
      a2aProvider: {
        getClient: () => ({
          inspectAgentCard: async (): Promise<Record<string, unknown>> => ({
            card: validAgentCard(),
            trust: unsignedTrust(),
            validation: { errors: [], valid: true },
          }),
          listAgents: async (): Promise<unknown[]> => [
            {
              card: validAgentCard(),
              lastSeen: '2026-06-24T00:00:00.000Z',
              online: true,
              trust: unsignedTrust(),
              validation: { errors: [], valid: true },
            },
          ],
        }),
        inspectAgentCardText: async (): Promise<Record<string, unknown>> => ({
          card: validAgentCard(),
          trust: unsignedTrust(),
          validation: { errors: [], valid: true },
        }),
      },
      debugProvider: {
        getClient: () => ({
          getSessionContext: async (): Promise<unknown> => ({
            createdAt: '2026-06-24T00:00:00.000Z',
            fixAttempts: [],
            id: 'session-1',
            status: 'open',
            tags: ['bug'],
            terminalCommands: [],
            title: 'Fix bug',
            updatedAt: '2026-06-24T00:00:00.000Z',
          }),
          searchSessions: async (): Promise<unknown> => ({
            sessions: [
              {
                createdAt: '2026-06-24T00:00:00.000Z',
                fixAttempts: [],
                id: 'session-1',
                status: 'open',
                tags: ['bug'],
                terminalCommands: [],
                title: 'Fix bug',
                updatedAt: '2026-06-24T00:00:00.000Z',
              },
            ],
            total: 1,
          }),
        }),
      },
      healthProvider: {
        getDashboard: async (): Promise<unknown> => ({
          servers: [
            {
              lastCheck: '2026-06-24T00:00:00.000Z',
              latencyMs: 12,
              name: 'health',
              status: 'up',
              uptime: 99,
              url: 'https://user:pass@example.com/mcp?token=secret',
            },
          ],
          summary: { degraded: 0, down: 0, total: 1, up: 1 },
        }),
        getState: (): unknown => ({
          dashboard: { servers: [], summary: { degraded: 0, down: 0, total: 0, up: 0 } },
        }),
      },
    };

    orbitTools.registerOrbitLanguageModelTools(context as never, providers as never);

    assert.deepStrictEqual(
      Array.from(registeredTools.keys()).sort(),
      Object.values(orbitTools.ORBIT_LANGUAGE_MODEL_TOOL_NAMES).sort()
    );
    assert.strictEqual(
      context.subscriptions.length,
      Object.values(orbitTools.ORBIT_LANGUAGE_MODEL_TOOL_NAMES).length
    );

    const healthResult = parseResult(
      await registeredTools
        .get(orbitTools.ORBIT_LANGUAGE_MODEL_TOOL_NAMES.GET_MCP_HEALTH)
        ?.invoke({ input: {} })
    ) as { servers: Array<{ url: string }> };
    assert.strictEqual(healthResult.servers[0]?.url, 'https://example.com/mcp?%E2%80%A6');

    const agentResult = parseResult(
      await registeredTools
        .get(orbitTools.ORBIT_LANGUAGE_MODEL_TOOL_NAMES.LIST_A2A_AGENTS)
        ?.invoke({ input: {} })
    ) as {
      agents: Array<{
        card: {
          capabilities: { extendedAgentCard?: boolean };
          securitySchemes: Record<string, { type: string }>;
        };
      }>;
    };
    assert.strictEqual(agentResult.agents[0]?.card.capabilities.extendedAgentCard, true);
    assert.strictEqual(agentResult.agents[0]?.card.securitySchemes.oidc?.type, 'openIdConnect');

    const validationResult = parseResult(
      await registeredTools
        .get(orbitTools.ORBIT_LANGUAGE_MODEL_TOOL_NAMES.VALIDATE_AGENT_CARD)
        ?.invoke({ input: { cardJson: JSON.stringify(validAgentCard()) } })
    ) as { validation: { valid: boolean } };
    assert.strictEqual(validationResult.validation.valid, true);
  });

  test('Should honor health refresh controls without bypassing the shared provider contract', async () => {
    let cacheReads = 0;
    let cacheFirstReads = 0;
    let forcedRefreshes = 0;
    const dashboard = {
      servers: [],
      summary: { degraded: 0, down: 0, total: 0, up: 0 },
    };
    const context = { subscriptions: [] as Disposable[] };
    orbitTools.registerOrbitLanguageModelTools(
      context as never,
      {
        a2aProvider: { getClient: () => ({ listAgents: async () => [] }) },
        debugProvider: { getClient: () => ({}) },
        healthProvider: {
          getDashboard: async () => {
            cacheFirstReads += 1;
            return dashboard;
          },
          getState: () => {
            cacheReads += 1;
            return { dashboard };
          },
          refreshDashboard: async () => {
            forcedRefreshes += 1;
            return dashboard;
          },
        },
      } as never
    );

    const tool = registeredTools.get(orbitTools.ORBIT_LANGUAGE_MODEL_TOOL_NAMES.GET_MCP_HEALTH);
    await tool?.invoke({ input: { refresh: false } });
    await tool?.invoke({ input: { refresh: true } });
    await tool?.invoke({ input: {} });

    assert.strictEqual(cacheReads, 1);
    assert.strictEqual(forcedRefreshes, 1);
    assert.strictEqual(cacheFirstReads, 1);
  });

  test('Should return parseable bounded JSON with explicit omission metadata', async () => {
    const huge = 'x'.repeat(20_000);
    const context = { subscriptions: [] as Disposable[] };
    orbitTools.registerOrbitLanguageModelTools(
      context as never,
      {
        a2aProvider: { getClient: () => ({ listAgents: async () => [] }) },
        debugProvider: {
          getClient: () => ({
            getSessionContext: async () => ({
              createdAt: '2026-06-24T00:00:00.000Z',
              description: huge,
              errorText: huge,
              fixAttempts: Array.from({ length: 100 }, (_, index) => ({
                description: `${index}:${huge}`,
                id: `fix-${index}`,
                successful: false,
                timestamp: '2026-06-24T00:00:00.000Z',
              })),
              id: 'session-large',
              status: 'open',
              tags: Array.from({ length: 100 }, (_, index) => `${index}:${huge}`),
              terminalCommands: Array.from({ length: 100 }, (_, index) => ({
                command: `${index}:${huge}`,
                timestamp: '2026-06-24T00:00:00.000Z',
              })),
              title: huge,
              updatedAt: '2026-06-24T00:00:00.000Z',
            }),
          }),
        },
        healthProvider: {
          getDashboard: async () => ({
            servers: [],
            summary: { degraded: 0, down: 0, total: 0, up: 0 },
          }),
          getState: () => ({
            dashboard: { servers: [], summary: { degraded: 0, down: 0, total: 0, up: 0 } },
          }),
          refreshDashboard: async () => ({
            servers: [],
            summary: { degraded: 0, down: 0, total: 0, up: 0 },
          }),
        },
      } as never
    );

    const result = await registeredTools
      .get(orbitTools.ORBIT_LANGUAGE_MODEL_TOOL_NAMES.GET_DEBUG_SESSION_CONTEXT)
      ?.invoke({ input: { sessionId: 'session-large' } });
    const text = resultText(result);
    const parsed = JSON.parse(text) as {
      _meta: { characterLimit: number; omitted: string[]; truncated: boolean };
    };

    assert.ok(text.length <= 4000, `tool output should be bounded, received ${text.length}`);
    assert.strictEqual(parsed._meta.characterLimit, 4000);
    assert.strictEqual(parsed._meta.truncated, true);
    assert.ok(parsed._meta.omitted.length > 0);
  });

  test('Should reject malformed input and cancelled invocations consistently', async () => {
    const context = { subscriptions: [] as Disposable[] };
    orbitTools.registerOrbitLanguageModelTools(
      context as never,
      {
        a2aProvider: { getClient: () => ({ listAgents: async () => [] }) },
        debugProvider: {
          getClient: () => ({ searchSessions: async () => ({ sessions: [], total: 0 }) }),
        },
        healthProvider: {
          getDashboard: async () => ({
            servers: [],
            summary: { degraded: 0, down: 0, total: 0, up: 0 },
          }),
          getState: () => ({
            dashboard: { servers: [], summary: { degraded: 0, down: 0, total: 0, up: 0 } },
          }),
          refreshDashboard: async () => ({
            servers: [],
            summary: { degraded: 0, down: 0, total: 0, up: 0 },
          }),
        },
      } as never
    );

    await assert.rejects(
      () =>
        registeredTools
          .get(orbitTools.ORBIT_LANGUAGE_MODEL_TOOL_NAMES.SEARCH_DEBUG_SESSIONS)
          ?.invoke({ input: { query: '   ' } }) as Promise<unknown>,
      /query must be a non-empty string/i
    );
    await assert.rejects(
      () =>
        registeredTools
          .get(orbitTools.ORBIT_LANGUAGE_MODEL_TOOL_NAMES.GET_MCP_HEALTH)
          ?.invoke({ input: {} }, { isCancellationRequested: true }) as Promise<unknown>,
      /cancelled/i
    );
  });

  test('Should keep safety guards in the tool implementation', () => {
    const source = fs.readFileSync(path.join(repoRoot(), 'src/lm/orbitTools.ts'), 'utf8');

    assert.ok(source.includes('assertWorkspaceTrusted();'));
    assert.ok(source.includes('recordToolAudit('));
    assert.ok(source.includes('const policyError = isPublicNetworkPolicyError(error)'));
    assert.ok(source.includes("policyError ? 'blocked' : 'failure'"));
    assert.ok(source.includes('MAX_TEXT_LENGTH'));
    assert.ok(!source.includes('truncateText(JSON.stringify'));
    assert.ok(source.includes('throwIfCancellationRequested(token)'));
  });
});
