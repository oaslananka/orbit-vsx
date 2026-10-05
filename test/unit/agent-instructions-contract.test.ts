import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';

const REPO_ROOT = path.resolve(__dirname, '..', '..');

function read(relativePath: string): string {
  return fs.readFileSync(path.join(REPO_ROOT, relativePath), 'utf8');
}

suite('Agent instruction contracts', () => {
  test('root routes every nested instruction boundary', () => {
    const root = read('AGENTS.md');

    for (const relativePath of [
      '.github/AGENTS.md',
      'src/mcp/AGENTS.md',
      'src/panels/AGENTS.md',
      'src/panels/a2a/AGENTS.md',
      'webview-ui/AGENTS.md',
    ]) {
      assert.ok(root.includes(relativePath), relativePath);
      assert.ok(fs.statSync(path.join(REPO_ROOT, relativePath)).isFile());
    }
  });

  test('critical trust boundaries keep stable markers', () => {
    const boundaries: Record<string, string[]> = {
      '.github/AGENTS.md': ['full commit SHAs', 'Pull-request code', 'VSIX'],
      'src/mcp/AGENTS.md': ['Workspace Trust', 'SecretStorage', 'Health and Debug'],
      'src/panels/AGENTS.md': ['non-idempotent mutations', 'redacted errors', 'non-overlapping'],
      'src/panels/a2a/AGENTS.md': ['HTTPS-only', 'RFC 8785', 'HS*', 'Workspace Trust'],
      'webview-ui/AGENTS.md': ['dangerouslySetInnerHTML', 'remote scripts', 'extension host'],
    };

    for (const [relativePath, markers] of Object.entries(boundaries)) {
      const text = read(relativePath);
      for (const marker of markers) {
        assert.ok(text.includes(marker), relativePath + ': ' + marker);
      }
    }
  });

  test('repository governance metadata stays out of the VSIX', () => {
    const vscodeIgnore = read('.vscodeignore');
    assert.match(vscodeIgnore, /^AGENTS\.md$/m);
    assert.match(vscodeIgnore, /^\.github\/$/m);
    assert.match(vscodeIgnore, /^src\/$/m);
    assert.match(vscodeIgnore, /^webview-ui\/$/m);
  });
});
