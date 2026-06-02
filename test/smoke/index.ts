import * as path from 'node:path';
import * as Mocha from 'mocha';

export function run(): Promise<void> {
  const mocha = new Mocha({
    ui: 'tdd',
    color: true,
    timeout: 20000,
  });
  const testsRoot = __dirname;
  mocha.addFile(path.resolve(testsRoot, 'package-smoke.test.js'));

  return new Promise((resolve, reject) => {
    try {
      mocha.run((failures) => {
        if (failures > 0) {
          reject(new Error(`${failures} packaged smoke tests failed.`));
        } else {
          resolve();
        }
      });
    } catch (err) {
      reject(err);
    }
  });
}
