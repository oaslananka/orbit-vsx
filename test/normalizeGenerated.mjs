import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const testRoot = path.dirname(fileURLToPath(import.meta.url));
const trackedRunner = path.join(testRoot, 'runTests.js');
const sourceMapComment = /\n?\/\/# sourceMappingURL=runTests\.js\.map\s*$/u;
const source = await readFile(trackedRunner, 'utf8');
const normalized = `${source.replace(sourceMapComment, '').trimEnd()}\n`;
await writeFile(trackedRunner, normalized, 'utf8');
