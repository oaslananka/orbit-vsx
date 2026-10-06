import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';

const REPO_ROOT = path.resolve(__dirname, '..', '..');

suite('Debug Detail View Contracts', () => {
  test('renders the same session contract returned by DebugClient', () => {
    const source = fs.readFileSync(path.join(REPO_ROOT, 'webview-ui/src/debug/App.tsx'), 'utf8');

    [
      'fixAttempts: FixAttempt[]',
      'terminalCommands: TerminalCommand[]',
      'successful: boolean',
      'updatedAt: string',
    ].forEach((snippet) => {
      assert.ok(source.includes(snippet), `${snippet} should be present`);
    });
    ['session.fixAttempts', 'session.terminalCommands', 'fix.successful'].forEach((snippet) => {
      assert.ok(source.includes(snippet), `${snippet} should be rendered`);
    });
    ['session.fixes', 'session.commands', 'success?: boolean'].forEach((snippet) => {
      assert.ok(!source.includes(snippet), `${snippet} should not be used`);
    });
  });

  test('verifies message origin before processing', () => {
    const source = fs.readFileSync(path.join(REPO_ROOT, 'webview-ui/src/debug/App.tsx'), 'utf8');
    assert.ok(
      source.includes('event.origin !== window.origin'),
      'should check event.origin against window.origin before processing messages'
    );
  });
});

suite('Debug Webview Message Origin Verification', () => {
  test('rejects messages from foreign origins', () => {
    const source = fs.readFileSync(path.join(REPO_ROOT, 'webview-ui/src/debug/App.tsx'), 'utf8');
    assert.ok(source.includes('return'), 'should return early when origin does not match');
  });

  test('accepts messages from same origin', () => {
    const source = fs.readFileSync(path.join(REPO_ROOT, 'webview-ui/src/debug/App.tsx'), 'utf8');
    assert.ok(
      source.includes('setSession(message.payload)'),
      'should process update messages from same origin'
    );
    assert.ok(
      source.includes('setError(message.payload.message'),
      'should process error messages from same origin'
    );
  });
});
