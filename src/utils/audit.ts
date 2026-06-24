import * as vscode from 'vscode';
import { redactUrl } from './urlSafety';

export type AuditSurface = 'mcp' | 'a2a' | 'debug' | 'cli' | 'network' | 'workspace';
export type AuditOutcome = 'started' | 'success' | 'failure' | 'blocked';

export interface AuditEvent {
  surface: AuditSurface;
  operation: string;
  outcome: AuditOutcome;
  target?: string;
  detail?: string;
}

const AUDIT_CHANNEL_NAME = 'Orbit:Audit';
let channel: vscode.OutputChannel | undefined;

export function recordAuditEvent(event: AuditEvent): void {
  const output = getAuditChannel();
  if (!output) return;

  const timestamp = new Date().toISOString();
  const fields = [
    `surface=${event.surface}`,
    `operation=${sanitizeField(event.operation)}`,
    `outcome=${event.outcome}`,
  ];
  if (event.target) fields.push(`target=${sanitizeField(redactUrl(event.target))}`);
  if (event.detail) fields.push(`detail=${sanitizeField(event.detail)}`);
  output.appendLine(`[AUDIT ${timestamp}] ${fields.join(' ')}`);
}

export function formatAuditEventForTest(
  event: AuditEvent,
  timestamp = '2026-06-24T00:00:00.000Z'
): string {
  const parts = [
    `surface=${event.surface}`,
    `operation=${sanitizeField(event.operation)}`,
    `outcome=${event.outcome}`,
  ];
  if (event.target) parts.push(`target=${sanitizeField(redactUrl(event.target))}`);
  if (event.detail) parts.push(`detail=${sanitizeField(event.detail)}`);
  return `[AUDIT ${timestamp}] ${parts.join(' ')}`;
}

function getAuditChannel(): vscode.OutputChannel | undefined {
  if (channel) return channel;
  const windowWithOutput = vscode.window as unknown as {
    createOutputChannel?: (name: string) => vscode.OutputChannel;
  };
  if (typeof windowWithOutput.createOutputChannel !== 'function') return undefined;
  channel = windowWithOutput.createOutputChannel(AUDIT_CHANNEL_NAME);
  return channel;
}

function sanitizeField(value: string): string {
  return value.replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, '_');
}
