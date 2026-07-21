# Release Governance

Orbit releases must be reproducible, reviewable, and protected from accidental or
unverified publishing.

## Protected main branch

The `main` branch is protected. Required checks are:

- `Node 22 / VS Code 1.100.0`
- `Node 24 / VS Code stable`
- `dependency-review`
- `analyze (javascript-typescript)`
- `semgrep`
- `Coverage, tests, and bundles`
- `actionlint, ShellCheck, zizmor, and Trivy`

The weekly compatibility workflow additionally tests current VS Code stable and reports
Insiders regressions as a non-blocking early-warning lane. Branch deletion and force-push
are disabled. Conversation resolution is required before merging.

## Release flow

1. Merge only verified pull requests into `main`.
2. Create a version pull request that updates `package.json`, `CHANGELOG.md`, and release
   notes.
3. Tag the reviewed version commit from `main` only.
4. Let `.github/workflows/release.yml` rebuild and verify the repository from that tag.
5. The workflow packages the VSIX, emits an SPDX JSON SBOM and SHA256 checksums, creates
   signed provenance and SBOM attestations, publishes to both extension registries, and
   creates or updates the GitHub Release.
6. If a registry publish fails after artifact generation, rerun the workflow from the
   same verified tag. Do not rebuild or replace release artifacts locally.

The release workflow resolves pnpm exclusively from the exact `packageManager` value in
`package.json` through Corepack. Global or `mise`-provided pnpm shims are not release
authorities.

## Published artifacts

Each GitHub Release contains:

- `orbit-vsx-<version>.vsix`
- `orbit-vsx.spdx.json`
- `SHA256SUMS.txt`
- `orbit-vsx.provenance.bundle.json`
- `orbit-vsx.sbom.bundle.json`

The GitHub Actions workflow also uploads the signed attestations to the repository
attestation API. Public-repository signatures use Sigstore-issued short-lived
certificates bound to the workflow identity and source ref.

## Consumer verification

Download every release asset into one directory and verify the checksum manifest:

```bash
sha256sum -c SHA256SUMS.txt
```

Verify the VSIX provenance online against the exact repository, signer workflow, and tag:

```bash
gh attestation verify orbit-vsx-0.6.1.vsix \
  --repo oaslananka/orbit-vsx \
  --signer-workflow oaslananka/orbit-vsx/.github/workflows/release.yml \
  --source-ref refs/tags/v0.6.1
```

The same provenance can be checked without fetching the attestation from the GitHub API
when the release bundle is already downloaded:

```bash
gh attestation verify orbit-vsx-0.6.1.vsix \
  --repo oaslananka/orbit-vsx \
  --signer-workflow oaslananka/orbit-vsx/.github/workflows/release.yml \
  --source-ref refs/tags/v0.6.1 \
  --bundle orbit-vsx.provenance.bundle.json
```

To inspect the SBOM assertion, verify with the predicate type reported in the downloaded
`orbit-vsx.sbom.bundle.json` bundle. Verification must fail if the artifact digest,
repository identity, signer workflow, or source tag differs.

## Release evidence review

After every release, maintainers must confirm:

- the tag commit is reachable from `main`;
- Marketplace and Open VSX report the same version;
- the GitHub Release contains the expected five artifact classes;
- `sha256sum -c SHA256SUMS.txt` succeeds;
- `gh attestation verify` succeeds for the VSIX using both API-backed and offline bundle
  verification;
- the provenance statement references `.github/workflows/release.yml` and the exact tag.

Record failures or manual recovery actions on the release issue.

## Protected tags

Release tags use `v*` and are created only from `main`. If GitHub rulesets are available
for the repository plan, protect `v*` tags with the same source and workflow restrictions
as the release job.

## Merge policy

- Security and release-blocker fixes can merge as soon as all required checks pass.
- Feature pull requests include tests and documentation for user-visible behavior.
- Dependency pull requests follow `docs/DEPENDENCY_POLICY.md`.
- Release provenance or workflow-permission changes require an immutable action pin,
  contract tests, and actionlint validation.
