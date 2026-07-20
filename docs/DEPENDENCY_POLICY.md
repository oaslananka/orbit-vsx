# Dependency and Automation Policy

Orbit uses the Mend Renovate GitHub App and layered GitHub security checks to keep the extension current without silently raising the supported VS Code or Node floor.

## Update lanes

- **Runtime and extension API floor**: never auto-raise `engines.vscode`, `@types/vscode`, or `engines.node`. These changes require a maintainer decision and release note.
- **Patch, pin, and digest updates**: may be automerged only after all protected checks pass.
- **Minor devDependency updates**: may be automerged unless the package is compatibility-sensitive.
- **Compatibility-sensitive updates**: TypeScript, React, esbuild, VS Code test/publish tooling, and runtime-floor changes require manual review for minor or major updates.
- **Major updates**: always require manual review.
- **GitHub Actions**: remain pinned to immutable commit SHAs with version comments so Renovate can safely update digests and preserve review context.
- **New npm releases**: use the Renovate best-practices minimum release age before normal update PRs are created.
- **Lockfile maintenance**: refreshes the pnpm lockfile weekly but requires manual review because minimum release-age checks do not apply to package-manager-driven lockfile refreshes.
- **Vulnerability alerts**: bypass the normal schedule, receive security labels, and require manual review.

## Transitive overrides

Use `pnpm-workspace.yaml` overrides only for security or compatibility reasons. Each override must include a follow-up issue or Renovate dashboard note so it can be removed after upstream packages catch up.

## Dependency Dashboard

The Renovate Dependency Dashboard is the single tracking issue for dependency decisions that should not be handled automatically. If it is closed manually, Renovate may recreate or reopen it on a later run.

## Required checks before dependency merge

- Node 22 / VS Code 1.100.0
- Node 24 / VS Code stable
- Dependency Review
- CodeQL analyze
- Semgrep CE
- the existing SonarCloud and Snyk GitHub App checks
- Package smoke tests through the CI verify chain

## Tooling setup

See `docs/SECURITY_TOOLING.md` for Renovate validation, pre-commit hooks, Semgrep, SonarQube Cloud, Snyk, required secrets, and branch-protection guidance.
