import type { DebugSession } from './types';

export interface DebugSessionIdentity {
  id: string;
  name: string;
}

export interface DebugTrackingClient {
  startDebugSession(title: string): Promise<DebugSession>;
  closeSession(id: string): Promise<void>;
}

export interface DebugSessionTrackerLogger {
  info(message: string): void;
  warn(message: string): void;
}

interface TrackedSession {
  readonly vscodeSession: DebugSessionIdentity;
  readonly client: DebugTrackingClient;
  creationTask: Promise<void>;
  orbitSessionId?: string;
  terminationRequested: boolean;
  closeTask?: Promise<void>;
}

const NOOP_LOGGER: DebugSessionTrackerLogger = {
  info: (): void => undefined,
  warn: (): void => undefined,
};

export class DebugSessionTracker {
  private readonly trackedSessions = new Map<string, TrackedSession>();
  private disposed = false;
  private shutdownTask: Promise<void> | undefined;

  constructor(
    private readonly getClient: () => DebugTrackingClient,
    private readonly logger: DebugSessionTrackerLogger = NOOP_LOGGER,
    private readonly onTrackedSessionsChanged: () => Promise<void> | void = () => undefined
  ) {}

  start(session: DebugSessionIdentity): Promise<void> {
    if (this.disposed || this.trackedSessions.has(session.id)) return Promise.resolve();

    let client: DebugTrackingClient;
    try {
      client = this.getClient();
    } catch (error) {
      this.logger.warn(
        `Failed to obtain Debug Recorder client for VS Code session ${session.name}: ${errorMessage(error)}`
      );
      return Promise.resolve();
    }

    const tracked: TrackedSession = {
      client,
      creationTask: Promise.resolve(),
      terminationRequested: false,
      vscodeSession: { id: session.id, name: session.name },
    };
    this.trackedSessions.set(session.id, tracked);
    tracked.creationTask = this.createOrbitSession(tracked);
    return tracked.creationTask;
  }

  terminate(session: DebugSessionIdentity): Promise<void> {
    const tracked = this.trackedSessions.get(session.id);
    if (!tracked) return Promise.resolve();
    if (tracked.terminationRequested) {
      return tracked.closeTask ?? tracked.creationTask;
    }

    tracked.terminationRequested = true;
    this.logger.info(`VS Code debug session terminated: ${session.name}`);
    return tracked.orbitSessionId ? this.closeOrbitSession(tracked) : tracked.creationTask;
  }

  shutdown(): Promise<void> {
    if (this.shutdownTask) return this.shutdownTask;
    this.disposed = true;

    const tracked = Array.from(this.trackedSessions.values());
    for (const entry of tracked) entry.terminationRequested = true;

    this.shutdownTask = Promise.allSettled(
      tracked.map(async (entry) => {
        await entry.creationTask;
        if (entry.orbitSessionId) await this.closeOrbitSession(entry);
      })
    ).then(() => {
      this.trackedSessions.clear();
    });
    return this.shutdownTask;
  }

  dispose(): void {
    void this.shutdown();
  }

  private async createOrbitSession(tracked: TrackedSession): Promise<void> {
    const { vscodeSession } = tracked;
    this.logger.info(`VS Code debug session started: ${vscodeSession.name}`);

    try {
      const orbitSession = await tracked.client.startDebugSession(vscodeSession.name);
      if (this.trackedSessions.get(vscodeSession.id) !== tracked) return;

      tracked.orbitSessionId = orbitSession.id;
      this.logger.info(
        `Orbit debug session ${orbitSession.id} created for VS Code session ${vscodeSession.name}`
      );
      this.notifyTrackedSessionsChanged();

      if (tracked.terminationRequested || this.disposed) {
        await this.closeOrbitSession(tracked);
      }
    } catch (error) {
      if (this.trackedSessions.get(vscodeSession.id) === tracked) {
        this.trackedSessions.delete(vscodeSession.id);
      }
      this.logger.warn(
        `Failed to auto-track debug start for ${vscodeSession.name}: ${errorMessage(error)}`
      );
    }
  }

  private closeOrbitSession(tracked: TrackedSession): Promise<void> {
    if (tracked.closeTask) return tracked.closeTask;
    const orbitSessionId = tracked.orbitSessionId;
    if (!orbitSessionId) return tracked.creationTask;

    tracked.closeTask = (async () => {
      try {
        await tracked.client.closeSession(orbitSessionId);
        this.logger.info(
          `Orbit debug session ${orbitSessionId} closed for VS Code session ${tracked.vscodeSession.name}`
        );
      } catch (error) {
        this.logger.warn(
          `Failed to auto-track debug close for ${tracked.vscodeSession.name}: ${errorMessage(error)}`
        );
      } finally {
        if (this.trackedSessions.get(tracked.vscodeSession.id) === tracked) {
          this.trackedSessions.delete(tracked.vscodeSession.id);
        }
        this.notifyTrackedSessionsChanged();
      }
    })();
    return tracked.closeTask;
  }

  private notifyTrackedSessionsChanged(): void {
    try {
      Promise.resolve(this.onTrackedSessionsChanged()).catch((error) => {
        this.logger.warn(`Failed to refresh Debug Recorder sessions: ${errorMessage(error)}`);
      });
    } catch (error) {
      this.logger.warn(`Failed to refresh Debug Recorder sessions: ${errorMessage(error)}`);
    }
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
