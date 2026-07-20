import * as assert from 'node:assert';
import type { DebugSessionIdentity } from '../../src/panels/debug/DebugSessionTracker';
import {
  DebugIntegrationController,
  type DebugIntegrationFactories,
  type DebugIntegrationSettings,
  type DebugIntegrationTracker,
  type DisposableLike,
} from '../../src/panels/debug/DebugIntegrationController';

class TestDisposable implements DisposableLike {
  disposeCount = 0;
  dispose(): void {
    this.disposeCount += 1;
  }
}

class TestTracker extends TestDisposable implements DebugIntegrationTracker {
  starts: DebugSessionIdentity[] = [];
  terminations: DebugSessionIdentity[] = [];
  shutdownCount = 0;

  async start(session: DebugSessionIdentity): Promise<void> {
    this.starts.push(session);
  }

  async terminate(session: DebugSessionIdentity): Promise<void> {
    this.terminations.push(session);
  }

  async shutdown(): Promise<void> {
    this.shutdownCount += 1;
  }
}

interface Harness {
  controller: DebugIntegrationController;
  decorations: TestDisposable[];
  startCallbacks: Array<(session: DebugSessionIdentity) => void>;
  startSubscriptions: TestDisposable[];
  terminateCallbacks: Array<(session: DebugSessionIdentity) => void>;
  terminateSubscriptions: TestDisposable[];
  trackers: TestTracker[];
}

function createHarness(): Harness {
  const trackers: TestTracker[] = [];
  const decorations: TestDisposable[] = [];
  const startCallbacks: Array<(session: DebugSessionIdentity) => void> = [];
  const terminateCallbacks: Array<(session: DebugSessionIdentity) => void> = [];
  const startSubscriptions: TestDisposable[] = [];
  const terminateSubscriptions: TestDisposable[] = [];
  const factories: DebugIntegrationFactories = {
    createDecorations: () => {
      const disposable = new TestDisposable();
      decorations.push(disposable);
      return disposable;
    },
    createTracker: () => {
      const tracker = new TestTracker();
      trackers.push(tracker);
      return tracker;
    },
    onDidStartDebugSession: (callback) => {
      startCallbacks.push(callback);
      const subscription = new TestDisposable();
      startSubscriptions.push(subscription);
      return subscription;
    },
    onDidTerminateDebugSession: (callback) => {
      terminateCallbacks.push(callback);
      const subscription = new TestDisposable();
      terminateSubscriptions.push(subscription);
      return subscription;
    },
  };
  return {
    controller: new DebugIntegrationController(factories),
    decorations,
    startCallbacks,
    startSubscriptions,
    terminateCallbacks,
    terminateSubscriptions,
    trackers,
  };
}

const disabled: DebugIntegrationSettings = {
  autoTrackVscodeSessions: false,
  showEditorDecorations: false,
};

suite('Debug Integration Controller', () => {
  test('Should enable, disable, and re-enable integrations without duplicate resources', async () => {
    const harness = createHarness();

    harness.controller.reconcile(disabled);
    harness.controller.reconcile({
      autoTrackVscodeSessions: true,
      showEditorDecorations: true,
    });
    harness.controller.reconcile({
      autoTrackVscodeSessions: true,
      showEditorDecorations: true,
    });

    assert.strictEqual(harness.trackers.length, 1);
    assert.strictEqual(harness.decorations.length, 1);
    assert.strictEqual(harness.startSubscriptions.length, 1);
    assert.strictEqual(harness.terminateSubscriptions.length, 1);

    harness.startCallbacks[0]?.({ id: 'vscode-1', name: 'Debug one' });
    harness.terminateCallbacks[0]?.({ id: 'vscode-1', name: 'Debug one' });
    await Promise.resolve();
    assert.deepStrictEqual(harness.trackers[0]?.starts, [{ id: 'vscode-1', name: 'Debug one' }]);
    assert.deepStrictEqual(harness.trackers[0]?.terminations, [
      { id: 'vscode-1', name: 'Debug one' },
    ]);

    harness.controller.reconcile(disabled);
    await harness.controller.waitForIdle();
    assert.strictEqual(harness.trackers[0]?.shutdownCount, 1);
    assert.strictEqual(harness.decorations[0]?.disposeCount, 1);
    assert.strictEqual(harness.startSubscriptions[0]?.disposeCount, 1);
    assert.strictEqual(harness.terminateSubscriptions[0]?.disposeCount, 1);

    harness.controller.reconcile({
      autoTrackVscodeSessions: true,
      showEditorDecorations: true,
    });
    assert.strictEqual(harness.trackers.length, 2);
    assert.strictEqual(harness.decorations.length, 2);

    await harness.controller.shutdown();
    assert.strictEqual(harness.trackers[1]?.shutdownCount, 1);
    assert.strictEqual(harness.decorations[1]?.disposeCount, 1);
  });

  test('Should dispose immediately and wait for pending tracker shutdowns', async () => {
    const harness = createHarness();
    harness.controller.reconcile({
      autoTrackVscodeSessions: true,
      showEditorDecorations: true,
    });

    harness.controller.dispose();
    await harness.controller.waitForIdle();

    assert.strictEqual(harness.trackers[0]?.shutdownCount, 1);
    assert.strictEqual(harness.decorations[0]?.disposeCount, 1);
    harness.controller.reconcile({
      autoTrackVscodeSessions: true,
      showEditorDecorations: true,
    });
    assert.strictEqual(harness.trackers.length, 1, 'disposed controller must not re-enable');
  });
});
