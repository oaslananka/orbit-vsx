import * as assert from 'node:assert';
import { formatAuditEvent } from '../../src/utils/auditFormat';

suite('Audit Formatting', () => {
  test('Should redact URL targets while preserving typed non-URL targets', () => {
    const urlLine = formatAuditEvent(
      {
        operation: 'discover_agent_card',
        outcome: 'success',
        surface: 'network',
        target: {
          kind: 'url',
          value: 'https://user:password@example.com/card.json?token=secret#fragment',
        },
      },
      '2026-07-20T00:00:00.000Z'
    );
    const pathLine = formatAuditEvent(
      {
        operation: 'validate_agent_card',
        outcome: 'success',
        surface: 'cli',
        target: { kind: 'path', value: '/workspace/agents/demo/agent-card.json' },
      },
      '2026-07-20T00:00:00.000Z'
    );
    const sessionLine = formatAuditEvent(
      {
        operation: 'close_debug_session',
        outcome: 'success',
        surface: 'debug',
        target: { kind: 'session', value: 'session-123' },
      },
      '2026-07-20T00:00:00.000Z'
    );

    assert.match(urlLine, /target_kind=url/);
    assert.match(urlLine, /target=https:\/\/example\.com\/card\.json\?%E2%80%A6/);
    assert.ok(!urlLine.includes('user'));
    assert.ok(!urlLine.includes('password'));
    assert.ok(!urlLine.includes('secret'));
    assert.ok(!urlLine.includes('fragment'));
    assert.match(pathLine, /target_kind=path/);
    assert.match(pathLine, /target=\/workspace\/agents\/demo\/agent-card\.json/);
    assert.match(sessionLine, /target_kind=session target=session-123/);
  });

  test('Should prevent control characters and field injection', () => {
    const line = formatAuditEvent(
      {
        detail: 'first\nsecond\t outcome=failure',
        operation: 'op\r\noperation=forged',
        outcome: 'success',
        surface: 'workspace',
        target: { kind: 'identifier', value: 'value\nnext=field\u0000' },
      },
      '2026-07-20T00:00:00.000Z'
    );

    assert.strictEqual(line.split('\n').length, 1);
    assert.ok(!line.includes('\r'));
    assert.ok(!line.includes('\t'));
    assert.ok(!line.includes('\u0000'));
    assert.ok(!line.includes('operation=forged'));
    assert.ok(!line.includes('next=field'));
    assert.match(line, /operation=op_operation%3Dforged/);
    assert.match(line, /target=value_next%3Dfield/);
    assert.match(line, /detail=first_second_outcome%3Dfailure/);
  });
});
