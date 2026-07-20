import { mkdirSync, rmSync } from 'node:fs';

for (const directory of ['coverage', '.test-results']) {
  rmSync(directory, { recursive: true, force: true });
}
mkdirSync('.test-results', { recursive: true });
