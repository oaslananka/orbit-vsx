import * as assert from 'node:assert';
import { createElectronHostEnv } from '../electronHostEnv';

suite('Electron Host Environment', () => {
  test('Should remove Node-mode flags before launching VS Code', () => {
    const source = {
      ELECTRON_RUN_AS_NODE: '1',
      PATH: 'test-path',
      VSCODE_DEV: '1',
    };

    const result = createElectronHostEnv(source);

    assert.strictEqual(result.ELECTRON_RUN_AS_NODE, undefined);
    assert.strictEqual(result.VSCODE_DEV, undefined);
    assert.strictEqual(result.PATH, 'test-path');
    assert.strictEqual(source.ELECTRON_RUN_AS_NODE, '1');
    assert.strictEqual(source.VSCODE_DEV, '1');
  });
});
