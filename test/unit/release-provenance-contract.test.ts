import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';

interface PackageManifest {
  license?: string;
  packageManager?: string;
}

const REPO_ROOT = path.resolve(__dirname, '..', '..');

function read(relativePath: string): string {
  return fs.readFileSync(path.join(REPO_ROOT, relativePath), 'utf8');
}

suite('Release Provenance Contracts', () => {
  test('Should attest every published release artifact with pinned official actions', () => {
    const workflow = read('.github/workflows/release.yml');

    assert.match(workflow, /id-token: write/);
    assert.match(workflow, /attestations: write/);
    assert.match(workflow, /artifact-metadata: write/);
    assert.match(workflow, /actions\/attest@[a-f0-9]{40} # v4\.2\.0/);
    assert.match(workflow, /id: provenance/);
    assert.match(workflow, /\.\/\*\.vsix/);
    assert.match(workflow, /\.\/orbit-vsx\.spdx\.json/);
    assert.match(workflow, /\.\/SHA256SUMS\.txt/);
    assert.match(workflow, /id: sbom-attestation/);
    assert.match(workflow, /sbom-path: \.\/orbit-vsx\.spdx\.json/);
    assert.match(workflow, /orbit-vsx\.provenance\.bundle\.json/);
    assert.match(workflow, /orbit-vsx\.sbom\.bundle\.json/);
    assert.match(workflow, /gh release upload[\s\S]*orbit-vsx\.provenance\.bundle\.json/);
    assert.match(workflow, /gh release create[\s\S]*orbit-vsx\.sbom\.bundle\.json/);
  });

  test('Should document checksum and online or offline attestation verification', () => {
    const governance = read('docs/RELEASE_GOVERNANCE.md');

    assert.match(governance, /sha256sum -c SHA256SUMS\.txt/);
    assert.match(governance, /gh attestation verify/);
    assert.match(governance, /--signer-workflow/);
    assert.match(governance, /--source-ref refs\/tags\/v/);
    assert.match(governance, /--bundle orbit-vsx\.provenance\.bundle\.json/);
    assert.match(governance, /Sigstore/i);
  });

  test('Should track every pnpm override with a reason, reference, and removal condition', () => {
    const workspace = read('pnpm-workspace.yaml');
    const overrideDocument = read('docs/PNPM_OVERRIDES.md');
    const overrideKeys = [
      '@vscode/test-cli>glob',
      '@vscode/vsce>glob',
      '@vscode/vsce>keytar',
      'cheerio>encoding-sniffer',
      'mocha>glob',
      'mocha>diff',
      'mocha>serialize-javascript',
      'shell-quote',
      'test-exclude>glob',
      'form-data',
      'undici',
      'js-yaml',
      'brace-expansion@<1.1.16',
      'brace-expansion@>=2.0.0 <2.1.2',
      'brace-expansion@>=3.0.0 <5.0.7',
    ];

    assert.match(workspace, /docs\/PNPM_OVERRIDES\.md/);
    for (const key of overrideKeys) {
      assert.ok(workspace.includes(key), `${key} should remain represented in pnpm overrides`);
      assert.ok(overrideDocument.includes(`\`${key}\``), `${key} should be documented`);
    }
    assert.match(overrideDocument, /Reason/i);
    assert.match(overrideDocument, /Reference/i);
    assert.match(overrideDocument, /Removal condition/i);
    assert.match(overrideDocument, /GHSA-73rr-hh4g-fpgx/);
    assert.match(overrideDocument, /GHSA-hmw2-7cc7-3qxx/);
    assert.match(overrideDocument, /GHSA-vmh5-mc38-953g/);
    assert.match(overrideDocument, /GHSA-3jxr-9vmj-r5cp/);
  });

  test('Should expose consistent Apache-2.0 metadata and the complete license text', () => {
    const manifest = JSON.parse(read('package.json')) as PackageManifest;
    const license = read('LICENSE');

    assert.strictEqual(manifest.license, 'Apache-2.0');
    assert.match(manifest.packageManager ?? '', /^pnpm@\d+\.\d+\.\d+$/);
    assert.ok(license.length > 10_000, 'LICENSE should contain the complete Apache 2.0 text');
    assert.match(license, /Apache License\s+Version 2\.0, January 2004/);
    assert.match(license, /END OF TERMS AND CONDITIONS/);
    assert.match(license, /APPENDIX: How to apply the Apache License to your work/);
  });

  test('Should declare one dependency-update authority and an explicit security-alert policy', () => {
    const policy = read('docs/DEPENDENCY_POLICY.md');

    assert.match(policy, /Renovate.*version-update authority/is);
    assert.match(policy, /Dependabot\s+security updates[\s\S]*disabled/i);
    assert.match(policy, /Dependabot alerts.*advisory/is);
    assert.match(policy, /Renovate vulnerability alerts.*security pull requests/is);
  });
});
