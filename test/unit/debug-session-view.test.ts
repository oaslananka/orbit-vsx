import * as assert from 'node:assert';
import { buildDebugSessionGroups } from '../../src/panels/debug/sessionView';
import type { DebugSession } from '../../src/panels/debug/types';

const NOW = Date.parse('2026-07-20T12:00:00.000Z');

function session(
  id: string,
  status: DebugSession['status'],
  updatedAt: string,
  createdAt = updatedAt
): DebugSession {
  return {
    createdAt,
    fixAttempts: [],
    id,
    status,
    tags: [],
    terminalCommands: [],
    title: id,
    updatedAt,
  };
}

suite('Debug Session View', () => {
  test('Should sort active and recent sessions deterministically and apply a global limit', () => {
    const groups = buildDebugSessionGroups(
      [
        session('recent-old', 'resolved', '2026-07-19T12:00:00.000Z'),
        session('active-old', 'open', '2026-07-18T12:00:00.000Z'),
        session('recent-new', 'abandoned', '2026-07-20T11:00:00.000Z'),
        session('active-new', 'open', '2026-07-20T10:00:00.000Z'),
      ],
      3,
      NOW
    );

    assert.deepStrictEqual(
      groups.active.map((item) => item.id),
      ['active-new', 'active-old']
    );
    assert.deepStrictEqual(
      groups.recent.map((item) => item.id),
      ['recent-new']
    );
    assert.strictEqual(groups.visibleCount, 3);
  });

  test('Should include exactly seven days and exclude older or invalid recent sessions', () => {
    const groups = buildDebugSessionGroups(
      [
        session('boundary', 'resolved', '2026-07-13T12:00:00.000Z'),
        session('too-old', 'resolved', '2026-07-13T11:59:59.999Z'),
        session('invalid', 'abandoned', 'not-a-date'),
      ],
      50,
      NOW
    );

    assert.deepStrictEqual(
      groups.recent.map((item) => item.id),
      ['boundary']
    );
    assert.strictEqual(groups.visibleCount, 1);
  });

  test('Should prioritize active sessions when the limit is exhausted', () => {
    const groups = buildDebugSessionGroups(
      [
        session('active-1', 'open', '2026-07-20T11:00:00.000Z'),
        session('active-2', 'open', '2026-07-20T10:00:00.000Z'),
        session('active-3', 'open', '2026-07-20T09:00:00.000Z'),
        session('recent-1', 'resolved', '2026-07-20T11:30:00.000Z'),
      ],
      2,
      NOW
    );

    assert.deepStrictEqual(
      groups.active.map((item) => item.id),
      ['active-1', 'active-2']
    );
    assert.deepStrictEqual(groups.recent, []);
    assert.strictEqual(groups.visibleCount, 2);
  });

  test('Should use stable IDs to break equal timestamp ties', () => {
    const groups = buildDebugSessionGroups(
      [
        session('zeta', 'resolved', '2026-07-20T10:00:00.000Z'),
        session('alpha', 'resolved', '2026-07-20T10:00:00.000Z'),
      ],
      50,
      NOW
    );

    assert.deepStrictEqual(
      groups.recent.map((item) => item.id),
      ['alpha', 'zeta']
    );
  });
});
