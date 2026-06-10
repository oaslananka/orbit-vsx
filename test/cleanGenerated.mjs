import { readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const testRoot = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.dirname(testRoot);
const generatedExtensions = ['.js', '.js.map'];
const roots = [path.join(repoRoot, 'src'), testRoot];

async function removeGeneratedFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  await Promise.all(
    entries.map(async (entry) => {
      const target = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        await removeGeneratedFiles(target);
        return;
      }
      if (generatedExtensions.some((extension) => entry.name.endsWith(extension))) {
        await rm(target);
      }
    })
  );
}

await Promise.all(roots.map(removeGeneratedFiles));
