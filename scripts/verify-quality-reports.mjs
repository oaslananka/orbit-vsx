import { existsSync, readFileSync } from 'node:fs';
import { isAbsolute, normalize, sep } from 'node:path';

const lcovPath = 'coverage/lcov.info';
const junitPath = '.test-results/junit.xml';

for (const reportPath of [lcovPath, junitPath]) {
  if (!existsSync(reportPath)) {
    throw new Error(`Expected quality report is missing: ${reportPath}`);
  }
}

const lcov = readFileSync(lcovPath, 'utf8');
const sourceFiles = lcov
  .split(/\r?\n/u)
  .filter((line) => line.startsWith('SF:'))
  .map((line) => line.slice(3));

if (sourceFiles.length === 0) {
  throw new Error('LCOV report does not contain any source files.');
}

for (const sourceFile of sourceFiles) {
  const normalized = normalize(sourceFile);
  if (
    isAbsolute(sourceFile) ||
    normalized.startsWith(`..${sep}`) ||
    !normalized.endsWith('.ts') ||
    !existsSync(normalized)
  ) {
    throw new Error(`LCOV source must resolve to a tracked TypeScript source file: ${sourceFile}`);
  }
}

const junit = readFileSync(junitPath, 'utf8');
if (!/<testsuite\b/u.test(junit)) {
  throw new Error('JUnit report does not contain a testsuite root.');
}

for (const forbidden of ['CODECOV_TOKEN', 'SNYK_TOKEN', 'VSCE_PAT', 'OVSX_PAT']) {
  if (junit.includes(forbidden)) {
    throw new Error(`JUnit report contains a forbidden credential marker: ${forbidden}`);
  }
}

console.log(
  JSON.stringify({
    junit: junitPath,
    lcov: lcovPath,
    sourceFiles: sourceFiles.length,
  })
);
