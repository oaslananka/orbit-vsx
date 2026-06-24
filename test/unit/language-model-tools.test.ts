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

function parseResult(result: unknown): unknown {
  const value = result as ToolResult;
  return JSON.parse(value.content[0]?.value ?? '{}');
}

function validAgentCard(): Record<string, unknown> {
  return {
    capabilities: { streaming: true },
    defaultInputModes: ['application/json'],
    defaultOutputModes: ['application/json'],
    description: 'Demo agent',
    name: 'demo-agent',
    skills: [{ description: 'Demo skill', id: 'demo', name: 'Demo', tags: ['demo'] }],
    supportedInterfaces: [
      { protocolBinding: 'jsonrpc', protocolVersion: '1.0', url: 'https://agent.example.com/a2a' },
    ],
    version: '1.0.0',
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
          fetchAgentCard: async (): Promise<Record<string, unknown>> => validAgentCard(),
          listAgents: async (): Promise<unknown[]> => [
            {
              card: validAgentCard(),
              lastSeen: '2026-06-24T00:00:00.000Z',
              online: true,
              validation: { errors: [], valid: true },
            },
          ],
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

    const validationResult = parseResult(
      await registeredTools
        .get(orbitTools.ORBIT_LANGUAGE_MODEL_TOOL_NAMES.VALIDATE_AGENT_CARD)
        ?.invoke({ input: { cardJson: JSON.stringify(validAgentCard()) } })
    ) as { validation: { valid: boolean } };
    assert.strictEqual(validationResult.validation.valid, true);
  });

  test('Should keep safety guards in the tool implementation', () => {
    const source = fs.readFileSync(path.join(repoRoot(), 'src/lm/orbitTools.ts'), 'utf8');

    assert.ok(source.includes('assertWorkspaceTrusted();'));
    assert.ok(source.includes('recordToolAudit('));
    assert.ok(source.includes('MAX_TEXT_LENGTH'));
  });
});
