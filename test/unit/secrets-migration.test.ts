import * as assert from 'node:assert';
import * as Module from 'node:module';
import type * as SecretsModule from '../../src/secrets';

type LoadFunction = (request: string, parent: NodeModule | null, isMain: boolean) => unknown;
type ModuleWithLoad = typeof Module & { _load: LoadFunction };

interface Inspection {
  globalValue?: string;
  workspaceFolderValue?: string;
  workspaceValue?: string;
}

interface UpdateCall {
  key: string;
  resource: string;
  target: number;
  value: unknown;
}

const moduleWithLoad = Module as unknown as ModuleWithLoad;
const originalLoad = moduleWithLoad._load;
const updates: UpdateCall[] = [];
const rootValues = new Map<string, string>();
const inspections = new Map<string, Inspection>();
const folderInspections = new Map<string, Map<string, Inspection>>();
const workspaceFolders = [
  { uri: { toString: () => 'file:///workspace/one' } },
  { uri: { toString: () => 'file:///workspace/two' } },
];

const ConfigurationTarget = {
  Global: 1,
  Workspace: 2,
  WorkspaceFolder: 3,
};

function resourceKey(resource: { toString(): string } | undefined): string {
  return resource?.toString() ?? '<root>';
}

const vscodeMock = {
  ConfigurationTarget,
  commands: { registerCommand: () => ({ dispose: () => undefined }) },
  window: {
    showInformationMessage: () => undefined,
    showInputBox: async () => undefined,
    showWarningMessage: async () => undefined,
  },
  workspace: {
    workspaceFolders,
    getConfiguration: (_section?: string, resource?: { toString(): string }) => ({
      get: (key: string, fallback: string): string => rootValues.get(key) ?? fallback,
      inspect: (key: string): Inspection | undefined => {
        const resourceMap = folderInspections.get(resourceKey(resource));
        return resourceMap?.get(key) ?? inspections.get(key);
      },
      update: async (key: string, value: unknown, target: number): Promise<void> => {
        updates.push({ key, resource: resourceKey(resource), target, value });
      },
    }),
  },
};

suite('Secret Migration', () => {
  let secretsModule: typeof SecretsModule;

  suiteSetup(async () => {
    moduleWithLoad._load = function load(request, parent, isMain): unknown {
      if (request === 'vscode') return vscodeMock;
      return originalLoad.call(this, request, parent, isMain);
    };
    const modulePath = require.resolve('../../src/secrets');
    delete require.cache[modulePath];
    secretsModule = await import('../../src/secrets');
  });

  setup(() => {
    updates.length = 0;
    rootValues.clear();
    inspections.clear();
    folderInspections.clear();
    for (const folder of workspaceFolders) {
      folderInspections.set(folder.uri.toString(), new Map());
    }
  });

  suiteTeardown(() => {
    moduleWithLoad._load = originalLoad;
    delete require.cache[require.resolve('../../src/secrets')];
  });

  test('Should keep existing secrets authoritative and clear every plaintext scope', async () => {
    const keys = ['orbit.health.token', 'orbit.debug.token'];
    for (const key of keys) {
      rootValues.set(key, `effective-${key}`);
      inspections.set(key, {
        globalValue: `global-${key}`,
        workspaceValue: `workspace-${key}`,
      });
      for (const folder of workspaceFolders) {
        folderInspections.get(folder.uri.toString())?.set(key, {
          workspaceFolderValue: `folder-${key}`,
        });
      }
    }
    const stores: Array<[string, string]> = [];
    const secretStorage = {
      delete: async () => undefined,
      get: async (key: string) => `secret-${key}`,
      onDidChange: () => ({ dispose: () => undefined }),
      store: async (key: string, value: string) => {
        stores.push([key, value]);
      },
    };

    await secretsModule.initializeOrbitSecrets(secretStorage as never);

    assert.strictEqual(secretsModule.getCachedHealthToken(), 'secret-orbit.health.token');
    assert.strictEqual(secretsModule.getCachedDebugToken(), 'secret-orbit.debug.token');
    assert.deepStrictEqual(stores, []);
    assert.strictEqual(updates.length, 8);
    for (const key of keys) {
      assert.ok(
        updates.some((call) => call.key === key && call.resource === '<root>' && call.target === 1)
      );
      assert.ok(
        updates.some((call) => call.key === key && call.resource === '<root>' && call.target === 2)
      );
      for (const folder of workspaceFolders) {
        assert.ok(
          updates.some(
            (call) =>
              call.key === key && call.resource === folder.uri.toString() && call.target === 3
          )
        );
      }
    }
    assert.ok(updates.every((call) => call.value === undefined));
  });

  test('Should migrate the effective legacy value once and then clear all scopes', async () => {
    rootValues.set('orbit.health.token', ' legacy-health ');
    rootValues.set('orbit.debug.token', ' legacy-debug ');
    inspections.set('orbit.health.token', { globalValue: 'legacy-health' });
    inspections.set('orbit.debug.token', { workspaceValue: 'legacy-debug' });
    const stores: Array<[string, string]> = [];
    const secretStorage = {
      delete: async () => undefined,
      get: async () => undefined,
      onDidChange: () => ({ dispose: () => undefined }),
      store: async (key: string, value: string) => {
        stores.push([key, value]);
      },
    };

    await secretsModule.initializeOrbitSecrets(secretStorage as never);

    assert.deepStrictEqual(stores, [
      ['orbit.health.token', 'legacy-health'],
      ['orbit.debug.token', 'legacy-debug'],
    ]);
    assert.strictEqual(secretsModule.getCachedHealthToken(), 'legacy-health');
    assert.strictEqual(secretsModule.getCachedDebugToken(), 'legacy-debug');
    assert.strictEqual(updates.length, 2);
  });
});
