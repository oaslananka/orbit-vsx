import { bench, describe } from 'vitest';
import type { DebugSession } from '../src/panels/debug/types';
import { buildDebugSessionGroups } from '../src/panels/debug/sessionView';
import { formatAuditEvent, sanitizeAuditField } from '../src/utils/auditFormat';
import { escapeHtml, serializeJsonForInlineScript } from '../src/utils/escapeHtml';
import { parseJsonRpcResponse } from '../src/utils/mcpJsonRpc';
import { joinUrl, normalizeHttpUrl, redactUrl } from '../src/utils/urlSafety';
import { agentCard } from './fixtures';

const NOW = Date.UTC(2025, 5, 1);
const STATUSES: DebugSession['status'][] = ['open', 'resolved', 'abandoned'];

const sessions: DebugSession[] = Array.from({ length: 1000 }, (_, index) => ({
  id: `session-${index.toString().padStart(4, '0')}`,
  title: `Investigate failure ${index}`,
  status: STATUSES[index % STATUSES.length] as DebugSession['status'],
  createdAt: new Date(NOW - index * 3_600_000).toISOString(),
  updatedAt: new Date(NOW - index * 1_800_000).toISOString(),
  tags: ['ci', `area-${index % 7}`],
  fixAttempts: [],
  terminalCommands: [],
}));

// Text containing every character escapeHtml rewrites: & < > "
const untrustedText = `orbit ${String.fromCharCode(38, 60, 62, 34)} a2a agent card `.repeat(200);
const inlineScriptPayload = { cards: Array.from({ length: 20 }, () => agentCard(5)) };
const toolsResponse = {
  jsonrpc: '2.0',
  id: 42,
  result: {
    tools: Array.from({ length: 50 }, (_, index) => ({
      name: `tool_${index}`,
      description: `Tool number ${index}`,
      inputSchema: { type: 'object', properties: { value: { type: 'string' } } },
    })),
  },
};

describe('debug sessions', () => {
  bench('buildDebugSessionGroups (1000 sessions)', () => {
    buildDebugSessionGroups(sessions, 50, NOW);
  });
});

describe('html escaping', () => {
  bench('escapeHtml', () => {
    escapeHtml(untrustedText);
  });

  bench('serializeJsonForInlineScript', () => {
    serializeJsonForInlineScript(inlineScriptPayload);
  });
});

describe('url safety', () => {
  bench('normalizeHttpUrl (public)', () => {
    normalizeHttpUrl('https://agent.example/path/to/card#fragment');
  });

  bench('normalizeHttpUrl (localhost allowed)', () => {
    normalizeHttpUrl('http://127.0.0.1:3000/', { allowLocalhost: true });
  });

  bench('redactUrl', () => {
    redactUrl('https://user:secret@agent.example/a2a?token=abc#section');
  });

  bench('joinUrl', () => {
    joinUrl('http://127.0.0.1:3001', '/api/sessions/search');
  });
});

describe('audit and json-rpc', () => {
  bench('formatAuditEvent', () => {
    formatAuditEvent(
      {
        surface: 'a2a',
        operation: 'fetch agent card',
        outcome: 'success',
        target: { kind: 'url', value: 'https://user:pw@agent.example/card?token=abc' },
        detail: 'resolved=well-known\nstatus=200',
      },
      '2025-06-01T00:00:00.000Z'
    );
  });

  bench('sanitizeAuditField', () => {
    sanitizeAuditField('line one\nline two\t\u0000 with control characters '.repeat(10));
  });

  bench('parseJsonRpcResponse (50 tools)', () => {
    parseJsonRpcResponse(toolsResponse, 42, 'tools/list');
  });
});
