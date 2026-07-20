import * as assert from 'node:assert';
import * as Module from 'node:module';
import type * as NativeMcpProviderModule from '../../src/mcp/nativeMcpProvider';

type LoadFunction = (request: string, parent: NodeModule | null, isMain: boolean) => unknown;
type ModuleWithLoad = typeof Module & { _load: LoadFunction };
type Disposable = { dispose(): void };
type DefinitionProvider = {
  provideMcpServerDefinitions(): unknown[];
};

class MockUri {
  private constructor(private readonly value: string) {}

  static parse(value: string): MockUri {
    return new MockUri(value);
  }

  toString(): string {
    return this.value;
  }
}

class MockMcpHttpServerDefinition {
  constructor(
    public readonly label: string,
    public readonly uri: MockUri,
    public readonly headers: Record<string, string> = {},
    public readonly version?: string
  ) {}
}

class MockEventEmitter {
  readonly event = (): Disposable => ({ dispose: (): void => undefined });

  fire(): void {}

  dispose(): void {}
}

const moduleWithLoad = Module as unknown as ModuleWithLoad;
const originalLoad = moduleWithLoad._load;
let registeredProvider: DefinitionProvider | undefined;

const vscodeMock = {
  EventEmitter: MockEventEmitter,
  McpHttpServerDefinition: MockMcpHttpServerDefinition,
  Uri: MockUri,
  lm: {
    registerMcpServerDefinitionProvider: (
      _providerId: string,
      provider: DefinitionProvider
    ): Disposable => {
      registeredProvider = provider;
      return { dispose: (): void => undefined };
    },
  },
  window: {
    createOutputChannel: (): { appendLine(value: string): void; dispose(): void } => ({
      appendLine: (): void => undefined,
      dispose: (): void => undefined,
    }),
  },
  workspace: {
    getConfiguration: (): { get<T>(_key: string, fallback: T): T } => ({
      get: <T>(_key: string, fallback: T): T => fallback,
    }),
    isTrusted: true,
  },
};

suite('Native MCP Provider', () => {
  let nativeMcpProvider: typeof NativeMcpProviderModule;

  suiteSetup(async () => {
    moduleWithLoad._load = function load(request, parent, isMain): unknown {
      if (request === 'vscode') return vscodeMock;
      return originalLoad.call(this, request, parent, isMain);
    };
    nativeMcpProvider = await import('../../src/mcp/nativeMcpProvider');
  });

  setup(() => {
    registeredProvider = undefined;
    vscodeMock.workspace.isTrusted = true;
  });

  suiteTeardown(() => {
    moduleWithLoad._load = originalLoad;
  });

  test('Should construct current VS Code HTTP definitions with positional Uri arguments', () => {
    const ProviderConstructor =
      nativeMcpProvider.OrbitMcpServerDefinitionProvider as unknown as new (
        runtime: unknown,
        extensionVersion: string
      ) => NativeMcpProviderModule.OrbitMcpServerDefinitionProvider;
    const provider = new ProviderConstructor(vscodeMock, '9.8.7');

    assert.strictEqual(provider.isRegistered, true);
    assert.ok(registeredProvider, 'provider should be registered');

    const definitions =
      registeredProvider.provideMcpServerDefinitions() as Array<MockMcpHttpServerDefinition>;

    assert.strictEqual(definitions.length, 2);
    assert.strictEqual(definitions[0]?.label, 'Orbit Health Monitor MCP');
    assert.strictEqual(definitions[0]?.uri.toString(), 'http://127.0.0.1:3000/mcp');
    assert.deepStrictEqual(definitions[0]?.headers, {});
    assert.strictEqual(definitions[0]?.version, '9.8.7');
    assert.strictEqual(definitions[1]?.label, 'Orbit Debug Recorder MCP');
    assert.strictEqual(definitions[1]?.uri.toString(), 'http://127.0.0.1:3001/mcp');
    assert.strictEqual(definitions[1]?.version, '9.8.7');

    provider.dispose();
  });
});
