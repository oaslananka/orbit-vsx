# Contributing

Thanks for improving Orbit. This repository builds a VS Code extension for MCP
health monitoring, debug session history, and A2A agent exploration.

## Development Setup

Requirements:

- Node.js 22 or newer.
- Corepack enabled.
- `pnpm` 11.3.0, as declared in `package.json`.

Install dependencies:

```powershell
corepack enable
pnpm install --frozen-lockfile
```

## Local Verification

Run the narrowest relevant command while developing, then run the full set before
opening or updating a pull request:

```powershell
task lint        # ESLint
task format      # Prettier
task typecheck   # TypeScript compiler
task test        # Unit + integration tests
task build       # esbuild (extension + webviews)
```

The repository-level verification shortcut runs all deterministic checks,
including the packaged extension smoke test:

```powershell
task verify
```

Verify the local Electron runtime or use the digest-pinned clean container:

```bash
corepack pnpm run check:headless-runner
corepack pnpm run verify:container
```

See `docs/HEADLESS_TESTING.md` for stable, minimum-version, Insiders, and VPS-2 procedures.

Install and run the local security hooks before submitting a security-sensitive
change:

```bash
python3 -m pip install --user pre-commit
pre-commit install
pre-commit run --all-files
pnpm run validate:renovate
pnpm run security:semgrep
```

`pnpm run security:snyk` and the manual `orbit-snyk` pre-commit stage are available
when Snyk authentication is configured. SonarCloud and Snyk pull-request checks are
provided by the installed GitHub Apps; see `docs/SECURITY_TOOLING.md` for local use and
branch-protection guidance.

Remove generated `.vsix` files after package verification unless you are
publishing a release artifact.

## Coding Rules

- Do not modify `dist/` directly. Build it with esbuild.
- Do not modify `CHANGELOG.md` unless bumping a version.
- Do not add runtime dependencies to the extension host. Prefer Node builtins.
- Register new commands in both `package.json` contributes and the matching
  `src/commands/*.ts` module.
- Route configuration reads through `src/config.ts`.
- Use `Logger` from `src/utils/logger.ts`; do not add `console.log`.
- Use `getNonce()` from `src/utils/webview.ts` for all webview HTML.
- Keep generated coverage output and package artifacts out of commits.

## Pull Requests

Every pull request should include:

- A clear summary of changed behavior.
- Linked issues using `Closes #N` or `Fixes #N` when the PR should close them.
- Local verification commands and results.
- Screenshots or recordings for UI changes.
- Release impact, including Marketplace/Open VSX or packaging changes.

Address review comments with follow-up commits and keep the PR body current if
scope changes.

## Release Operations

Maintainer-only release steps live in `RELEASING.md`. Keep publishing secrets,
registry tokens, and release automation mechanics out of the public Marketplace
README.

## Security

Do not include credentials, tokens, cookies, private keys, or private service
URLs in issues, pull requests, logs, screenshots, or test fixtures. Follow
`SECURITY.md` for vulnerability reports.
