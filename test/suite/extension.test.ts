import * as assert from 'node:assert';
import * as vscode from 'vscode';

suite('Orbit Extension', () => {
  test('Extension should be present', () => {
    const ext = vscode.extensions.getExtension('oaslananka.orbit');
    assert.ok(ext, 'Extension oaslananka.orbit should be available');
  });

  test('Should activate', async () => {
    const ext = vscode.extensions.getExtension('oaslananka.orbit');
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

  test('Should register all tree views', () => {
    const healthView = vscode.window.createTreeView('orbit.health', {
      treeDataProvider: {} as never,
    });
    assert.ok(healthView, 'orbit.health view should be creatable');

    const debugView = vscode.window.createTreeView('orbit.debug', {
      treeDataProvider: {} as never,
    });
    assert.ok(debugView, 'orbit.debug view should be creatable');

    const a2aView = vscode.window.createTreeView('orbit.a2a', { treeDataProvider: {} as never });
    assert.ok(a2aView, 'orbit.a2a view should be creatable');
  });
});
