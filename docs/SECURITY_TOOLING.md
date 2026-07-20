# Security and Dependency Tooling

Orbit uses layered checks so a single vendor or scanner is not the only line of defense.
The repository baseline combines Renovate, GitHub Dependency Review, CodeQL, OpenSSF
Scorecard, Semgrep CE, and the existing SonarCloud and Snyk GitHub App checks.

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
and a repository-specific Semgrep scan. The Semgrep hook uses a pinned Python package
version inside the isolated pre-commit environment. Snyk is available as a manual-stage
hook because it requires authentication and should not make ordinary commits depend on
a third-party service.

Useful local commands:

```bash
pnpm run validate:renovate
pnpm run security:semgrep
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

The Renovate version used by this command, the Semgrep CLI version, and the Snyk CLI
version are themselves tracked by Renovate custom managers.

## Semgrep CE

`.github/workflows/semgrep.yml` runs on pull requests, pushes to `main`, a weekly
schedule, and manual dispatch. It does not require `SEMGREP_APP_TOKEN`.

The CI scan combines Semgrep's explicit TypeScript and JavaScript community rulesets with Orbit-specific rules in
`.semgrep.yml`. Results are emitted as SARIF and uploaded to GitHub code scanning when
the event permissions allow it. The job still enforces the scanner exit code after the
SARIF upload step.

Managed Semgrep can be adopted later, but the tokenless CE workflow remains the minimum
portable baseline.

## SonarCloud

The installed SonarCloud GitHub integration already publishes the
`SonarCloud Code Analysis` check on pull requests. Orbit intentionally does not add a
second repository workflow for the same project: duplicate automatic and CI-based
analysis creates conflicting analysis modes and duplicate status checks.

Manage the project binding, Quality Gate, exclusions, and analysis mode in SonarCloud.
When changing analysis modes, keep exactly one of SonarCloud Automatic Analysis or a
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

- Never commit SonarCloud or Snyk credentials.
- The repository-owned Semgrep CE workflow needs no third-party token.
- Fork pull requests continue to receive the standard CI, CodeQL, Dependency Review,
  and Semgrep checks supported by their GitHub permissions.
- SonarCloud and Snyk access, organization membership, and service configuration are
  managed through their installed GitHub Apps rather than repository workflow files.

## Required checks

Keep these checks required on `main` after they have passed on the default branch:

- `Node 22 / VS Code 1.100.0`
- `Node 24 / VS Code stable`
- `dependency-review`
- `analyze (javascript-typescript)`
- `semgrep`
- `SonarCloud Code Analysis`
- `security/snyk (oaslananka)`

The repository-owned Semgrep workflow reports the `semgrep` context. App-managed
check names should be rechecked whenever either vendor integration is reinstalled or
reconfigured.
