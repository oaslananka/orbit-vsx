import type { DebugSession } from './types';

const RECENT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export interface DebugSessionGroups {
  active: DebugSession[];
  recent: DebugSession[];
  visibleCount: number;
}

export function buildDebugSessionGroups(
  sessions: readonly DebugSession[],
  maxSessionsShown: number,
  now = Date.now()
): DebugSessionGroups {
  const limit = normalizeLimit(maxSessionsShown);
  const active = sessions.filter((session) => session.status === 'open').sort(compareSessions);
  const recentCutoff = now - RECENT_WINDOW_MS;
  const recent = sessions
    .filter((session) => {
      if (session.status === 'open') return false;
      const updatedAt = Date.parse(session.updatedAt);
      return Number.isFinite(updatedAt) && updatedAt >= recentCutoff;
    })
    .sort(compareSessions);

  const visibleActive = active.slice(0, limit);
  const visibleRecent = recent.slice(0, Math.max(0, limit - visibleActive.length));
  return {
    active: visibleActive,
    recent: visibleRecent,
    visibleCount: visibleActive.length + visibleRecent.length,
  };
}

function compareSessions(left: DebugSession, right: DebugSession): number {
  const timeDifference = timestamp(right.updatedAt) - timestamp(left.updatedAt);
  if (timeDifference !== 0) return timeDifference;
  if (left.id < right.id) return -1;
  if (left.id > right.id) return 1;
  return 0;
}

function timestamp(value: string): number {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeLimit(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.trunc(value));
}
