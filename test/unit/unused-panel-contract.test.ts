import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const removedPanels = ['info', 'session', 'ta' + 'sk'];

suite('Unused Panel Contracts', () => {
  test('builds only reachable panel bundles', () => {
    const buildScript = fs.readFileSync(path.join(REPO_ROOT, 'esbuild-webview.js'), 'utf8');
    assert.ok(buildScript.includes("const panels = ['health', 'debug', 'a2a'];"));
    removedPanels.forEach((name) => {
      assert.ok(!fs.existsSync(path.join(REPO_ROOT, 'webview-ui/src', name)));
      assert.ok(!fs.existsSync(path.join(REPO_ROOT, 'src/panels', name)));
    });
  });
});
