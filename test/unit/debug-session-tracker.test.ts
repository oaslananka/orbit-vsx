import * as assert from 'node:assert';
import type { DebugSession } from '../../src/panels/debug/types';
import { DebugSessionTracker } from '../../src/panels/debug/DebugSessionTracker';

interface Deferred<T> {
  promise: Promise<T>;
  resolve(value: T): void;
  reject(error: unknown): void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function debugSession(id: string, title = id): DebugSession {
  return {
    createdAt: '2026-07-20T12:00:00.000Z',
    fixAttempts: [],
    id,
    status: 'open',
    tags: [],
    terminalCommands: [],
    title,
    updatedAt: '2026-07-20T12:00:00.000Z',
  };
}

suite('Debug Session Tracker', () => {
  test('Should keep concurrent VS Code and Orbit sessions correctly associated', async () => {
    const starts: string[] = [];
    const closes: string[] = [];
    const client = {
      startDebugSession: async (title: string): Promise<DebugSession> => {
        starts.push(title);
        return debugSession(`orbit-${title}`, title);
      },
      closeSession: async (id: string): Promise<void> => {
        closes.push(id);
      },
    };
    const tracker = new DebugSessionTracker(() => client);

    await Promise.all([
      tracker.start({ id: 'vscode-a', name: 'alpha' }),
      tracker.start({ id: 'vscode-b', name: 'beta' }),
    ]);
    await tracker.terminate({ id: 'vscode-b', name: 'beta' });
    await tracker.terminate({ id: 'vscode-a', name: 'alpha' });

    assert.deepStrictEqual(starts.sort(), ['alpha', 'beta']);
    assert.deepStrictEqual(closes, ['orbit-beta', 'orbit-alpha']);
    await tracker.shutdown();
  });

  test('Should ignore duplicate start and terminate events', async () => {
    let starts = 0;
    let closes = 0;
    const client = {
      startDebugSession: async (): Promise<DebugSession> => {
        starts += 1;
        return debugSession('orbit-1');
      },
      closeSession: async (): Promise<void> => {
        closes += 1;
      },
    };
    const tracker = new DebugSessionTracker(() => client);
    const session = { id: 'vscode-1', name: 'API' };

    await Promise.all([tracker.start(session), tracker.start(session)]);
    await Promise.all([tracker.terminate(session), tracker.terminate(session)]);

    assert.strictEqual(starts, 1);
    assert.strictEqual(closes, 1);
    await tracker.shutdown();
  });

  test('Should close a session that terminates before creation resolves', async () => {
    const creation = deferred<DebugSession>();
    const closes: string[] = [];
    const client = {
      startDebugSession: (): Promise<DebugSession> => creation.promise,
      closeSession: async (id: string): Promise<void> => {
        closes.push(id);
      },
    };
    const tracker = new DebugSessionTracker(() => client);
    const session = { id: 'vscode-race', name: 'Race' };

    const startPromise = tracker.start(session);
    const terminatePromise = tracker.terminate(session);
    creation.resolve(debugSession('orbit-race'));
    await Promise.all([startPromise, terminatePromise]);

    assert.deepStrictEqual(closes, ['orbit-race']);
    await tracker.shutdown();
  });

  test('Should not close an unknown Orbit session after creation failure', async () => {
    const warnings: string[] = [];
    let closes = 0;
    const client = {
      startDebugSession: async (): Promise<DebugSession> => {
        throw new Error('create failed');
      },
      closeSession: async (): Promise<void> => {
        closes += 1;
      },
    };
    const tracker = new DebugSessionTracker(() => client, {
      info: (): void => undefined,
      warn: (message): void => {
        warnings.push(message);
      },
    });
    const session = { id: 'vscode-failed', name: 'Failed' };

    await tracker.start(session);
    await tracker.terminate(session);

    assert.strictEqual(closes, 0);
    assert.ok(warnings.some((message) => message.includes('create failed')));
    await tracker.shutdown();
  });

  test('Should remove failed close mappings without retrying duplicate termination', async () => {
    const warnings: string[] = [];
    let closes = 0;
    const client = {
      startDebugSession: async (): Promise<DebugSession> => debugSession('orbit-close-failure'),
      closeSession: async (): Promise<void> => {
        closes += 1;
        throw new Error('close failed');
      },
    };
    const tracker = new DebugSessionTracker(() => client, {
      info: (): void => undefined,
      warn: (message): void => {
        warnings.push(message);
      },
    });
    const session = { id: 'vscode-close-failure', name: 'Close failure' };

    await tracker.start(session);
    await tracker.terminate(session);
    await tracker.terminate(session);

    assert.strictEqual(closes, 1);
    assert.ok(warnings.some((message) => message.includes('close failed')));
    await tracker.shutdown();
  });

  test('Should close active and pending mappings during shutdown', async () => {
    const pendingCreation = deferred<DebugSession>();
    const closes: string[] = [];
    const client = {
      startDebugSession: (title: string): Promise<DebugSession> =>
        title === 'pending'
          ? pendingCreation.promise
          : Promise.resolve(debugSession(`orbit-${title}`)),
      closeSession: async (id: string): Promise<void> => {
        closes.push(id);
      },
    };
    const tracker = new DebugSessionTracker(() => client);

    await tracker.start({ id: 'vscode-active', name: 'active' });
    const pendingStart = tracker.start({ id: 'vscode-pending', name: 'pending' });
    const shutdown = tracker.shutdown();
    pendingCreation.resolve(debugSession('orbit-pending'));
    await Promise.all([pendingStart, shutdown]);
    await tracker.start({ id: 'vscode-after-shutdown', name: 'ignored' });

    assert.deepStrictEqual(closes.sort(), ['orbit-active', 'orbit-pending']);
  });
});
