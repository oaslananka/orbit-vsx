import type { DebugSessionIdentity } from './DebugSessionTracker';

export interface DisposableLike {
  dispose(): void;
}

export interface DebugIntegrationSettings {
  autoTrackVscodeSessions: boolean;
  showEditorDecorations: boolean;
}

export interface DebugIntegrationTracker extends DisposableLike {
  start(session: DebugSessionIdentity): Promise<void>;
  terminate(session: DebugSessionIdentity): Promise<void>;
  shutdown(): Promise<void>;
}

export interface DebugDecorationIntegration extends DisposableLike {
  onClientChanged?(): void;
}

export interface DebugIntegrationFactories {
  createTracker(): DebugIntegrationTracker;
  createDecorations(): DebugDecorationIntegration;
  onDidStartDebugSession(callback: (session: DebugSessionIdentity) => void): DisposableLike;
  onDidTerminateDebugSession(callback: (session: DebugSessionIdentity) => void): DisposableLike;
}

interface TrackingResources {
  tracker: DebugIntegrationTracker;
  startSubscription: DisposableLike;
  terminateSubscription: DisposableLike;
}

export class DebugIntegrationController implements DisposableLike {
  private tracking: TrackingResources | undefined;
  private decorations: DebugDecorationIntegration | undefined;
  private readonly pendingShutdowns = new Set<Promise<void>>();
  private disposed = false;

  constructor(private readonly factories: DebugIntegrationFactories) {}

  reconcile(settings: DebugIntegrationSettings): void {
    if (this.disposed) return;

    if (settings.autoTrackVscodeSessions) this.enableTracking();
    else this.disableTracking();

    if (settings.showEditorDecorations) {
      this.decorations ??= this.factories.createDecorations();
    } else {
      this.disableDecorations();
    }
  }

  onDebugClientChanged(): void {
    this.decorations?.onClientChanged?.();
  }

  waitForIdle(): Promise<void> {
    return Promise.allSettled(Array.from(this.pendingShutdowns)).then(() => undefined);
  }

  async shutdown(): Promise<void> {
    if (!this.disposed) {
      this.disposed = true;
      this.disableDecorations();
      this.disableTracking();
    }
    await this.waitForIdle();
  }

  dispose(): void {
    void this.shutdown();
  }

  private enableTracking(): void {
    if (this.tracking) return;

    const tracker = this.factories.createTracker();
    let startSubscription: DisposableLike | undefined;
    let terminateSubscription: DisposableLike | undefined;
    try {
      startSubscription = this.factories.onDidStartDebugSession((session) => {
        void tracker.start(session);
      });
      terminateSubscription = this.factories.onDidTerminateDebugSession((session) => {
        void tracker.terminate(session);
      });
      this.tracking = { tracker, startSubscription, terminateSubscription };
    } catch (error) {
      startSubscription?.dispose();
      terminateSubscription?.dispose();
      void tracker.shutdown();
      throw error;
    }
  }

  private disableTracking(): void {
    const tracking = this.tracking;
    if (!tracking) return;
    this.tracking = undefined;
    tracking.startSubscription.dispose();
    tracking.terminateSubscription.dispose();
    tracking.tracker.dispose();

    const shutdown = tracking.tracker.shutdown().finally(() => {
      this.pendingShutdowns.delete(shutdown);
    });
    this.pendingShutdowns.add(shutdown);
  }

  private disableDecorations(): void {
    this.decorations?.dispose();
    this.decorations = undefined;
  }
}
