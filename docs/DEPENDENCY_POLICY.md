# Dependency and Automation Policy

Orbit uses the Mend Renovate GitHub App and layered GitHub security checks to keep the
extension current without silently raising the supported VS Code or Node floor.

## Automation ownership

Renovate is the repository's sole version-update authority for npm packages, pnpm,
GitHub Actions, Docker images, lockfile maintenance, and vulnerability-remediation pull
requests. A second version-update bot must not be enabled for the same manifests.

GitHub Dependabot alerts remain enabled as an advisory and inventory source. Dependabot
security updates are intentionally disabled to avoid duplicate pull requests and
competing lockfile changes. Renovate vulnerability alerts consume security advisory
information, bypass the normal schedule, and create security pull requests that still
require manual review and all protected checks.

Secret scanning, push protection, Dependency Review, CodeQL, Semgrep, SonarCloud, Snyk,
and OpenSSF Scorecard are independent controls and remain enabled alongside Renovate.

## Update lanes

- **Runtime and extension API floor**: never auto-raise `engines.vscode`,
  `@types/vscode`, or `engines.node`. These changes require a maintainer decision and
  release note.
- **Patch, pin, and digest updates**: may be automerged only after all protected checks
  pass.
- **Minor devDependency updates**: may be automerged unless the package is
  compatibility-sensitive.
- **Compatibility-sensitive updates**: TypeScript, React, esbuild, VS Code test/publish
  tooling, and runtime-floor changes require manual review for minor or major updates.
- **Major updates**: always require manual review.
- **GitHub Actions**: remain pinned to immutable commit SHAs with version comments so
  Renovate can safely update digests and preserve review context.
- **Docker images**: remain digest-pinned. Version and digest updates are handled by the
  repository-specific Renovate manager.
- **New npm releases**: use the Renovate best-practices minimum release age before normal
  update pull requests are created.
- **Lockfile maintenance**: refreshes the pnpm lockfile weekly but requires manual review
  because minimum release-age checks do not apply to package-manager-driven lockfile
  refreshes.
- **Vulnerability alerts**: bypass the normal schedule, receive security labels, and
  require manual review.

## Package-manager authority

`package.json#packageManager` is the single pnpm version authority. Local commands,
package scripts, CI, Docker runners, and release workflows invoke pnpm through Corepack.
Hard-coded workflow versions and PATH-resolved `pnpm` shims are prohibited.

## Transitive overrides

Use `pnpm-workspace.yaml` overrides only for security or compatibility reasons. Every
override must have a stable ID, reason, evidence/reference, and measurable removal
condition in `docs/PNPM_OVERRIDES.md`.

A pull request that changes `overrides` must update the register and regenerate the
lockfile. Renovate may update an override version, but it must not delete the associated
tracking record automatically.

## Dependency Dashboard

The Renovate Dependency Dashboard is the single tracking issue for dependency decisions
that should not be handled automatically. If it is closed manually, Renovate may recreate
or reopen it on a later run.

## Required checks before dependency merge

- Node 22 / VS Code 1.100.0
- Node 24 / VS Code stable
- Dependency Review
- CodeQL analyze
- Semgrep CE
- SonarCloud Code Analysis
- security/snyk (oaslananka)
- package smoke tests through the CI verification chain

## Tooling setup

See `docs/SECURITY_TOOLING.md` for Renovate validation, pre-commit hooks, Semgrep,
SonarCloud, Snyk, and branch-protection guidance. See `docs/PNPM_OVERRIDES.md` before
changing the lockfile or removing a transitive override.
