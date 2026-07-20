import { redactUrl } from './urlSafety';

export type AuditSurface = 'mcp' | 'a2a' | 'debug' | 'cli' | 'network' | 'workspace';
export type AuditOutcome = 'started' | 'success' | 'failure' | 'blocked';
export type AuditTargetKind = 'url' | 'path' | 'server' | 'session' | 'identifier';

export interface AuditTarget {
  kind: AuditTargetKind;
  value: string;
}

export interface AuditEvent {
  surface: AuditSurface;
  operation: string;
  outcome: AuditOutcome;
  target?: AuditTarget;
  detail?: string;
}

const DEFAULT_FIELD_LIMIT = 512;
const PATH_FIELD_LIMIT = 1024;

export function formatAuditEvent(event: AuditEvent, timestamp = new Date().toISOString()): string {
  const fields = [
    `surface=${event.surface}`,
    `operation=${sanitizeAuditField(event.operation)}`,
    `outcome=${event.outcome}`,
  ];

  if (event.target) {
    fields.push(`target_kind=${event.target.kind}`);
    fields.push(`target=${formatAuditTarget(event.target)}`);
  }
  if (event.detail) {
    fields.push(`detail=${sanitizeAuditField(event.detail)}`);
  }

  return `[AUDIT ${timestamp}] ${fields.join(' ')}`;
}

export function sanitizeAuditField(value: string, maxLength = DEFAULT_FIELD_LIMIT): string {
  return value
    .replace(/[\u0000-\u001f\u007f-\u009f]+/g, ' ')
    .replace(/\s+/g, '_')
    .replace(/=/g, '%3D')
    .slice(0, maxLength);
}

function formatAuditTarget(target: AuditTarget): string {
  const value = target.kind === 'url' ? redactUrl(target.value) : target.value;
  return sanitizeAuditField(value, target.kind === 'path' ? PATH_FIELD_LIMIT : DEFAULT_FIELD_LIMIT);
}
