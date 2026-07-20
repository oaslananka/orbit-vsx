import * as vscode from 'vscode';
import {
  formatAuditEvent,
  type AuditEvent,
  type AuditOutcome,
  type AuditSurface,
  type AuditTarget,
  type AuditTargetKind,
} from './auditFormat';

export type { AuditEvent, AuditOutcome, AuditSurface, AuditTarget, AuditTargetKind };

const AUDIT_CHANNEL_NAME = 'Orbit:Audit';
let channel: vscode.OutputChannel | undefined;

export function recordAuditEvent(event: AuditEvent): void {
  getAuditChannel()?.appendLine(formatAuditEvent(event));
}

export function formatAuditEventForTest(
  event: AuditEvent,
  timestamp = '2026-06-24T00:00:00.000Z'
): string {
  return formatAuditEvent(event, timestamp);
}

export function disposeAuditChannel(): void {
  channel?.dispose();
  channel = undefined;
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
