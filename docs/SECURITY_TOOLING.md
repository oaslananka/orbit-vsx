# Security and Dependency Tooling

Orbit uses layered checks so a single vendor or scanner is not the only line of defense.
The repository baseline combines Renovate, GitHub Dependency Review, CodeQL, OpenSSF
Scorecard, Semgrep CE, and the existing SonarQube Cloud and Snyk GitHub App checks.

## Local setup

Install the JavaScript dependencies first:

```bash
corepack enable
corepack pnpm install --frozen-lockfile
```

Install pre-commit with your preferred Python tool and enable the hooks:

```bash
python3 -m pip install --user pre-commit
pre-commit install
pre-commit run --all-files
```

The default hooks perform file-hygiene checks, Prettier validation, ESLint validation,
actionlint workflow checks, ShellCheck script checks, a zizmor workflow-security audit,
and a repository-specific Semgrep scan. The Semgrep hook uses a pinned Python package
version inside the isolated pre-commit environment. Snyk is available as a manual-stage
hook because it requires authentication and should not make ordinary commits depend on
a third-party service.

Useful local commands:

```bash
pnpm run validate:renovate
pnpm run security:semgrep
pnpm run security:workflow
pnpm run security:trivy   # Linux x86_64; authoritative CI scan
pnpm run security:local
```

A local Snyk Open Source scan is available after authenticating the Snyk CLI:

```bash
export SNYK_TOKEN='<token>'
pnpm run security:snyk
pre-commit run orbit-snyk --hook-stage manual --all-files
```

## Renovate

The Mend Renovate GitHub App is installed for this repository. `renovate.json` extends
`config:best-practices` and adds Orbit-specific rules:

- VS Code and Node runtime support floors are never raised automatically.
- `@types/vscode` remains tied to the supported `engines.vscode` baseline.
- GitHub Actions remain pinned to immutable commit SHAs with version comments.
- npm releases observe the best-practices minimum release age.
- pnpm lockfile maintenance runs weekly and requires manual review because minimum release-age checks cannot be enforced for package-manager-driven lockfile refreshes.
- vulnerability-alert PRs are created immediately and require manual review.
- patch, pin, digest, and selected development-tool updates may automerge only after
  the protected GitHub checks pass.
- major and compatibility-sensitive updates require manual review.

Validate configuration changes before opening a pull request from the Node 24 maintainer lane (the current Renovate CLI requires Node 24.11 or newer):

```bash
pnpm run validate:renovate
```

The Renovate, Semgrep, Snyk, Codecov CLI, pre-commit runner, and Trivy versions are
tracked by Renovate. Trivy updates require manual checksum review before merge.

## Semgrep CE

`.github/workflows/semgrep.yml` runs on pull requests, pushes to `main`, a weekly
schedule, and manual dispatch. It does not require `SEMGREP_APP_TOKEN`.

The CI scan combines Semgrep's explicit TypeScript and JavaScript community rulesets with Orbit-specific rules in
`.semgrep.yml`. CI executes Semgrep 1.170.0 from an immutable multi-architecture image
digest rather than installing mutable Python artifacts at workflow runtime. Results are
emitted as SARIF and uploaded to GitHub code scanning when the event permissions allow
it. The job still enforces the scanner exit code after the SARIF upload step.

Sensitive `security-events`, release-content, attestation, artifact-metadata, and
OpenID Connect permissions are declared only on the jobs that require them. Every
workflow otherwise defaults to the explicit `contents: read` permission.

## GitHub workflow security

`.github/workflows/workflow-security.yml` runs actionlint 1.7.12, ShellCheck 0.11.0,
zizmor 1.27.0, and a checksum-verified Trivy 0.72.0 Dockerfile configuration scan on
every pull request and `main` push, plus a weekly schedule. actionlint validates workflow
syntax, expressions, action inputs, and reusable-workflow contracts. ShellCheck runs as
a separate pinned hook over repository shell scripts so ordinary commits do not compile
a WASM analyzer. zizmor runs offline with the regular persona so commits
do not depend on a GitHub API token while still enforcing permissions, immutable action
references, credential handling, and common injection protections.

Every checkout disables credential persistence. Release jobs disable package-manager
caching to prevent a pull-request-controlled cache from influencing a tagged release.
The Trivy scan is intentionally limited to HIGH/CRITICAL misconfigurations in
`tools/headless/Dockerfile`; Dependency Review and Snyk own dependency risk, GitHub
Secret Protection owns pushed credentials, and CodeQL plus Orbit's Semgrep rules own
source-code security.

`CODEOWNERS` requests maintainer review for all changes and explicitly owns workflows,
security policy, dependency automation, release operations, and the headless runner.
Because this repository currently has one maintainer, code-owner approval is requested
but is not a required self-review gate.

## Property-based security tests

`test/unit/security-fuzz.test.ts` uses the exact-pinned `fast-check` development
package to exercise canonical JSON handling across hundreds of generated values and
object insertion orders. These tests run inside both protected Node/VS Code CI lanes;
they are deterministic by seed and augment, rather than replace, explicit security
regression vectors.

Managed Semgrep can be adopted later, but the tokenless CE workflow remains the minimum
portable baseline.

## SonarQube Cloud

The installed SonarQube Cloud GitHub integration still publishes the legacy-named
`SonarCloud Code Analysis` check on pull requests. Orbit intentionally does not add a
second repository workflow for the same project: duplicate automatic and CI-based
analysis creates conflicting analysis modes and duplicate status checks.

Manage the project binding, Quality Gate, exclusions, and analysis mode in SonarQube Cloud.
When changing analysis modes, keep exactly one of SonarQube Cloud Automatic Analysis or a
CI-based scanner enabled. Record any future migration to CI-based analysis in a
separate issue and remove the app-managed check only after the replacement has passed
on `main`.

## Snyk

The installed Snyk GitHub integration already publishes the
`security/snyk (oaslananka)` pull-request check. Orbit therefore does not add a
second Snyk GitHub Actions workflow. The app-managed check remains the shared cloud
gate, while the pinned local CLI command and manual pre-commit stage provide an
on-demand developer check.

The local command requires `SNYK_TOKEN` or an authenticated Snyk CLI session:

```bash
export SNYK_TOKEN='<token>'
pnpm run security:snyk
```

Do not put Snyk credentials in repository files, shell history, or committed hook
configuration.

## Credentials and pull requests

- Never commit SonarQube Cloud or Snyk credentials.
- The repository-owned Semgrep CE workflow needs no third-party token.
- Fork pull requests continue to receive the standard CI, CodeQL, Dependency Review,
  and Semgrep checks supported by their GitHub permissions.
- SonarQube Cloud and Snyk access, organization membership, and service configuration are
  managed through their installed GitHub Apps rather than repository workflow files.

## Required checks

Keep these repository-owned checks required on `main` after they have passed on the default branch:

- `Node 22 / VS Code 1.100.0`
- `Node 24 / VS Code stable`
- `dependency-review`
- `analyze (javascript-typescript)`
- `semgrep`
- `Coverage, tests, and bundles`
- `actionlint, ShellCheck, zizmor, and Trivy`

SonarQube Cloud, Snyk, and Codecov patch/project statuses remain visible review signals,
but are not duplicate blocking gates. Promote a vendor status only when it owns a unique
policy that repository-owned checks do not already enforce.
