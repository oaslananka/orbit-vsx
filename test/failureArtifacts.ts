import * as fs from 'node:fs';
import * as path from 'node:path';

interface FailureArtifactMetadata {
  error: string;
  node: string;
  platform: string;
  vscodeVersion: string;
}

export function persistFailureArtifacts(
  profileRoot: string,
  suiteName: string,
  error: unknown
): string | undefined {
  try {
    const configuredRoot = process.env.ORBIT_TEST_ARTIFACTS_DIR?.trim();
    const artifactsRoot = path.resolve(configuredRoot || '.orbit-test-artifacts');
    const destination = path.join(artifactsRoot, sanitizeSegment(suiteName));
    fs.rmSync(destination, { recursive: true, force: true });
    fs.mkdirSync(destination, { recursive: true });

    const sourceLogs = path.join(profileRoot, 'user-data', 'logs');
    if (profileRoot && fs.existsSync(sourceLogs)) {
      fs.cpSync(sourceLogs, path.join(destination, 'logs'), { recursive: true });
    }

    const metadata: FailureArtifactMetadata = {
      error: error instanceof Error ? (error.stack ?? error.message) : String(error),
      node: process.version,
      platform: `${process.platform}-${process.arch}`,
      vscodeVersion: process.env.ORBIT_VSCODE_TEST_VERSION?.trim() || 'stable',
    };
    fs.writeFileSync(
      path.join(destination, 'failure.json'),
      `${JSON.stringify(metadata, null, 2)}\n`
    );
    process.stderr.write(`Persisted failure artifacts to ${destination}\n`);
    return destination;
  } catch (artifactError) {
    process.stderr.write(
      `Unable to persist failure artifacts: ${artifactError instanceof Error ? artifactError.message : String(artifactError)}\n`
    );
    return undefined;
  }
}

function sanitizeSegment(value: string): string {
  const normalized = value.replace(/[^a-zA-Z0-9._-]+/g, '-');
  const withoutLeadingDashes = normalized.replace(/^-+/, '');
  return withoutLeadingDashes.replace(/-+$/, '') || 'failure';
}
