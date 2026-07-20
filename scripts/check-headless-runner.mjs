import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const expectedPnpm = String(manifest.packageManager ?? '').replace(/^pnpm@/, '');
const requiredCommands = ['xvfb-run', 'unzip'];
const requiredLibraries = [
  'libatk-1.0.so.0',
  'libatk-bridge-2.0.so.0',
  'libgbm.so.1',
  'libgtk-3.so.0',
  'libnss3.so',
];
const failures = [];

for (const command of requiredCommands) {
  const result = spawnSync('sh', ['-lc', `command -v ${command}`], { encoding: 'utf8' });
  if (result.status !== 0) failures.push(`missing command: ${command}`);
}

const libraries = spawnSync('ldconfig', ['-p'], { encoding: 'utf8' });
if (libraries.status !== 0) {
  failures.push('unable to inspect shared libraries with ldconfig');
} else {
  for (const library of requiredLibraries) {
    if (!libraries.stdout.includes(library)) failures.push(`missing library: ${library}`);
  }
}

const pnpm = spawnSync('corepack', ['pnpm', '--version'], { encoding: 'utf8' });
const actualPnpm = pnpm.stdout.trim();
if (pnpm.status !== 0) failures.push('corepack pnpm is not executable');
else if (actualPnpm !== expectedPnpm) {
  failures.push(`pnpm version mismatch: expected ${expectedPnpm}, received ${actualPnpm}`);
}

if (failures.length > 0) {
  console.error('Orbit headless runner check failed:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  console.error('Run scripts/install-headless-deps.sh or use pnpm run verify:container.');
  process.exit(1);
}

console.log(`Orbit headless runner is ready (pnpm ${actualPnpm}).`);
