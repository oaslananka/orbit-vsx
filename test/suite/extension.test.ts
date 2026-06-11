import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { ORBIT_VIEW_CONTAINER_COMMAND } from '../../src/constants';
import { refreshStartupProviders } from '../../src/extension';

interface ExtensionManifest {
  name: string;
  publisher: string;
}

const NEXT_EVENT_LOOP_TICK_MS = 0;

function getExpectedExtensionId(): string {
  const manifestPath = path.resolve(__dirname, '..', '..', 'package.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as ExtensionManifest;
  return `${manifest.publisher}.${manifest.name}`;
}

function flushPromises(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, NEXT_EVENT_LOOP_TICK_MS));
}

suite('Orbit Extension', () => {
  test('Extension should be present', () => {
    const extensionId = getExpectedExtensionId();
    const ext = vscode.extensions.getExtension(extensionId);
    assert.ok(ext, `Extension ${extensionId} should be available`);
  });

  test('Should activate', async () => {
    const ext = vscode.extensions.getExtension(getExpectedExtensionId());
    if (!ext) {
      assert.fail('Extension not found');
      return;
    }
    await ext.activate();
    assert.ok(ext.isActive, 'Extension should be active after activation');
  });

  test('Should have expected commands registered', async () => {
    const expectedCommands = [
      'orbit.health.refresh',
      'orbit.health.addServer',
      'orbit.health.removeServer',
      'orbit.health.openDetail',
      'orbit.health.checkAll',
      'orbit.debug.newSession',
      'orbit.debug.refresh',
      'orbit.debug.openSession',
      'orbit.debug.closeSession',
      'orbit.debug.search',
      'orbit.debug.recordCommand',
      'orbit.a2a.refresh',
      'orbit.a2a.validate',
      'orbit.a2a.discover',
      'orbit.a2a.scaffold',
      'orbit.a2a.openCard',
    ];

    const allCommands = await vscode.commands.getCommands();
    expectedCommands.forEach((cmd) => {
      assert.ok(allCommands.includes(cmd), `Command ${cmd} should be registered`);
    });
  });

  test('Should expose the Orbit activity bar container command', async () => {
    const allCommands = await vscode.commands.getCommands(true);
    const invalidHealthViewCommand = `${ORBIT_VIEW_CONTAINER_COMMAND}.health`;

    assert.ok(
      allCommands.includes(ORBIT_VIEW_CONTAINER_COMMAND),
      `${ORBIT_VIEW_CONTAINER_COMMAND} should be registered by VS Code`
    );
    assert.ok(
      !allCommands.includes(invalidHealthViewCommand),
      'Invalid health-view workbench command should not be registered'
    );
  });

  test('Should register all tree views', () => {
    const healthView = vscode.window.createTreeView('orbit.health', {
      treeDataProvider: {} as never,
    });
    const debugView = vscode.window.createTreeView('orbit.debug', {
      treeDataProvider: {} as never,
    });
    const a2aView = vscode.window.createTreeView('orbit.a2a', { treeDataProvider: {} as never });

    try {
      assert.ok(healthView, 'orbit.health view should be creatable');
      assert.ok(debugView, 'orbit.debug view should be creatable');
      assert.ok(a2aView, 'orbit.a2a view should be creatable');
    } finally {
      healthView.dispose();
      debugView.dispose();
      a2aView.dispose();
    }
  });

  test('Should refresh startup providers during activation wiring', async () => {
    let debugRefreshes = 0;
    let a2aRefreshes = 0;
    const logger = { warn: (): void => undefined };

    refreshStartupProviders(
      logger,
      {
        refresh: async () => {
          debugRefreshes += 1;
        },
      },
      {
        refresh: async () => {
          a2aRefreshes += 1;
        },
      }
    );
    await flushPromises();

    assert.strictEqual(debugRefreshes, 1);
    assert.strictEqual(a2aRefreshes, 1);
  });

  test('Should log startup provider refresh failures', async () => {
    const warnings: string[] = [];
    const logger = {
      warn: (message: string): void => {
        warnings.push(message);
      },
    };

    refreshStartupProviders(logger, {
      refresh: () => {
        throw new Error('sync startup refresh failed');
      },
    });
    refreshStartupProviders(logger, {
      refresh: async () => {
        throw new Error('async startup refresh failed');
      },
    });
    await flushPromises();

    assert.strictEqual(warnings.length, 2);
    assert.match(warnings[0], /sync startup refresh failed/);
    assert.match(warnings[1], /async startup refresh failed/);
  });
});
