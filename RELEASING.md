# Releasing Orbit

This file is for repository maintainers. The public Marketplace README should
stay focused on extension users and must not include publishing mechanics,
repository secrets, or release operations.

## Release Prerequisites

The `Release` GitHub Actions workflow publishes tagged releases. The repository
must have these secrets configured before a tag is pushed:

| Secret     | Purpose                                                              |
| ---------- | -------------------------------------------------------------------- |
| `VSCE_PAT` | Personal Access Token for `vsce publish` to the VS Code Marketplace. |
| `OVSX_PAT` | Personal Access Token for `ovsx publish` to Open VSX.                |

The workflow uses Node.js 24 via `actions/setup-node`, enables `pnpm@11.3.0`
through Corepack, runs the full verification chain, generates an SBOM and
checksums, publishes to both registries, and creates or updates a GitHub Release
with all artifacts attached.

## Pre-Release Check

Run the local verification chain on a clean `main` checkout before creating a
tag. If release-prep changes are staged, include the staged gitleaks scan:

```powershell
pnpm install --frozen-lockfile
pnpm run format:check
pnpm run lint
pnpm run typecheck
pnpm run test:unit
pnpm run coverage
pnpm test
pnpm run test:package
pnpm audit --audit-level moderate
gitleaks git --staged --redact --no-banner
```

Remove any generated `.vsix` and `coverage/` output before committing release
prep changes unless the artifact is intentionally attached by the release
workflow.

## Release Flow

1. Verify the version in `package.json` and the release notes scope.
2. Commit any required version or documentation updates.
3. Create and push the annotated tag:

```powershell
git tag -a vX.Y.Z -m "vX.Y.Z"
git push origin vX.Y.Z
```

4. Watch the triggered release workflow to terminal state:

```powershell
gh run watch --exit-status
```

5. Verify the GitHub Release has the generated VSIX attached and confirm the
   SBOM and checksum file are available. Confirm the Marketplace and Open VSX
   listings show the new version.

If publishing fails after a tag was pushed, do not retag the same version. Fix
the cause, bump to the next patch version when a registry accepted a broken
artifact, and document the incident in the release notes or a follow-up issue.
