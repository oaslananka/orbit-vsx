# GitHub Automation Instructions

These instructions apply to `.github/**` and supplement the repository root instructions.

Workflow edits are repository governance and supply-chain changes.

## Merge and check contract

- Preserve the required checks documented in `docs/REPOSITORY_GOVERNANCE.md`.
- Do not rename, path-filter away, skip, or fake-success a required context without intentionally migrating branch protection and its documentation.
- Keep validation workflows cancellable where documented and release workflows non-cancellable where partial execution would be unsafe.

## Workflow security

- Keep third-party Actions pinned to reviewed full commit SHAs.
- Keep checkout credentials disabled unless a narrowly reviewed mutation step requires them.
- Default permissions remain read-only; grant write, OIDC, attestations or security-event scopes only to the smallest job that needs them.
- Pull-request code must not receive marketplace, release or other protected credentials.
- Do not introduce `pull_request_target` or equivalent privileged execution of untrusted PR content without an explicit security design.

## Release integrity

- Release tags must point to commits on `main` and match `package.json` version.
- Preserve the VSIX -> checksum -> SBOM -> provenance/SBOM attestation -> marketplace/GitHub Release identity chain.
- Do not replace release bytes under an existing immutable release identity.
- Visual Studio Marketplace and Open VSX publication remain explicit protected release actions.

## Validation

Run the repository workflow-security tests and relevant release/provenance contract tests for changes here. YAML syntax alone is not sufficient evidence.
