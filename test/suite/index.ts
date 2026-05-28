import * as path from 'node:path';
import * as Mocha from 'mocha';

export function run(): Promise<void> {
  const mocha = new Mocha({
    ui: 'tdd',
    color: true,
    timeout: 10000,
  });

  const testsRoot = path.resolve(__dirname, '..', '..', 'test', 'suite');

  mocha.addFile(path.resolve(testsRoot, 'extension.test.js'));
  mocha.addFile(path.resolve(testsRoot, 'health.test.js'));
  mocha.addFile(path.resolve(testsRoot, 'debug.test.js'));
  mocha.addFile(path.resolve(testsRoot, 'a2a.test.js'));

  return new Promise((resolve, reject) => {
    try {
      mocha.run((failures) => {
        if (failures > 0) {
          reject(new Error(`${failures} tests failed.`));
        } else {
          resolve();
        }
      });
    } catch (err) {
      reject(err);
    }
  });
}
