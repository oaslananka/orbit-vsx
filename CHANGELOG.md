# Changelog

## [Unreleased]

### Added

- Verify A2A Agent Card JWS signatures with RFC 8785 canonicalization, ES256/RS256 allowlists, same-origin or explicitly trusted HTTPS JWKS resolution, bounded key caching, and explicit trust states across trees, webviews, diagnostics, Language Model Tools, and audit output.

### Security

- Reject unsafe, malformed, tampered, expired, revoked, incompatible, and untrusted Agent Card signature inputs without logging raw signatures or key material.
- Pin all vulnerable `brace-expansion` major lines to the first patched releases for GHSA-3jxr-9vmj-r5cp / CVE-2026-13149.
- Upgrade the forced `js-yaml` line to 5.2.1 for GHSA-g796-fgmg-93mv and GHSA-724g-mxrg-4qvm; scope workflow write permissions to individual jobs and run Semgrep from an immutable container digest.
- Add property-based fuzz coverage for arbitrary canonical JSON values and object insertion-order invariance.
- Preserve prototype-like JSON keys such as `__proto__` as own properties during Agent Card canonicalization instead of allowing JavaScript prototype setters to drop signed fields.

## [0.6.0] - 2026-07-20

### Changed

- Add weekly stable and non-blocking Insiders compatibility lanes, a reproducible headless Docker runner, retained extension-host failure logs, and Corepack-only pnpm resolution.
- Apply Debug Recorder auto-tracking and editor-decoration setting changes without reloading VS Code, including initial-editor and document-edit refreshes.
- Preserve typed audit targets while sanitizing field injection and dispose the audit channel with the extension lifecycle.
- Honor Language Model Tool health refresh controls through the shared HealthStore and return deterministic, parseable JSON with explicit omission metadata.
- Track concurrent VS Code debug sessions through their matching Debug Recorder session IDs and close each mapped session exactly once on termination or extension shutdown.
- Apply `orbit.debug.maxSessionsShown` after deterministic sorting and restrict the `Recent (7 days)` group to sessions updated within that window.
- Align Agent Card validation with the A2A 1.0 ProtoJSON model, including security scheme wrappers, canonical security requirements, and `capabilities.extendedAgentCard`.
- Normalize supported pre-1.0 security scheme and `security` requirement shapes into the canonical runtime model before rendering or exposing them through Language Model Tools.

### Security

- Add Sigstore-backed GitHub provenance and SBOM attestations, offline release bundles, a complete Apache-2.0 license, and an auditable pnpm override register.
- Remove legacy plaintext token settings from every configuration scope even when SecretStorage already contains the authoritative token.
- Add repository-specific Renovate best-practices policy, strict config validation, GitHub Action digest tracking, vulnerability-alert handling, and weekly manual lockfile maintenance.
- Add tokenless Semgrep CE scanning in pre-commit and GitHub Actions, document the existing SonarCloud and Snyk GitHub App checks, and provide an optional manual Snyk pre-commit hook.
- Pin all GitHub Actions to immutable commit SHAs with Renovate-readable version comments.
- Harden untrusted Agent Card discovery with bounded manual redirects, DNS address policy checks, IP-pinned HTTPS connections, and a streaming 256 KiB response limit.
- Report blocked discovery policy outcomes without exposing URL credentials or query values in audit output.

## [0.5.7] - 2026-06-11

### Fixed

- Exclude local pnpm store and maintainer-only dotfiles from packaged VSIX artifacts.
- Add packaged-extension smoke coverage for forbidden local and maintainer-only files.
- Add repository line-ending attributes so Windows local verification matches CI formatting.
- Dispose test-created TreeViews in the extension-host suite.
- Align release documentation and workflow permissions with the current non-attestation release flow.

## [0.5.5] - 2026-06-11

### Added

- Fleet standards configs: `.npmrc`, `.github/dependabot.yml`, `.commitlintrc.json`, `.pre-commit-config.yaml`.
- Org-only guard (`github.repository_owner == 'oaslananka'`) on all CI/CD workflow jobs.
- `.prettierignore` for cleaner formatting output.

### Changed

- Migrated `renovate.json` to `config:recommended` with rate limits, auto-merge for patches and devDependencies.
- Updated `@vscode/vsce` to 3.9.2, `prettier` to 3.8.4, `@typescript-eslint/*` to 8.61.0, `concurrently` to 10.0.3, `ovsx` to 1.0.0.
- Updated `CONTRIBUTING.md` to reference Taskfile commands.

### Fixed

- Harden CI/CD release workflow with merge-base verification and create-or-update release support.
- Health provider error handling, race conditions, and debounce disposal.
- Added `escapeHtml` utility for proper XSS prevention in webviews.
- Improved test infrastructure with `cleanGenerated.mjs` and new contract tests.

### Removed

- Legacy `.eslintrc.json` (ESLint 9+ uses flat config `eslint.config.mjs`).

## [0.5.2] - 2026-06-02

### Fixed

- Removed `actions/setup-node` from CI and release workflows to avoid deprecation warnings emitted by the action runtime during release verification.

## [0.5.1] - 2026-06-02

### Fixed

- Renamed the Marketplace display name to avoid the Visual Studio Marketplace display-name collision encountered during the first public release attempt.

## [0.5.0] - 2026-05-30

### Added

- Proactive down/recover notifications when MCP server status changes
- Inline editor decorations showing error frequency from debug history
- CodeQL analysis, dependency review, and Scorecard CI workflows
- Published secrets documentation in README

### Changed

- Version bump from 0.1.1 to 0.5.0 (cumulative)

## [0.4.0] - 2026-05-30

### Added

- Loading state indicators to all tree providers
- Collapse-all button to debug and a2a tree views
- Live item counts in tree view headers
- Accessibility aria labels on all view title actions

## [0.3.0] - 2026-05-30

### Added

- Panel visibility toggles for info, sessions, tasks, MCP explorer
- Command palette shortcuts for all panel commands
- Rich hover previews (resolveTreeItem) for all tree item types
- Error state tree items when refresh fails on any provider
- Empty state placeholders for health and MCP explorer views
- Baseline tooltips for all tree item classes

### Fixed

- Error handling added to MCP explorer refresh command

## [0.2.0] - 2026-05-30

### Added

- Info, session, and task panel stubs (views + webview apps)
- Sessions refresh command with view/title menu entry
- MCP Explorer panel with tree data provider, refresh, and contextual title
- Inline agent-card.json validation on save and document change
- Unique IDs on all tree items for view state persistence

## [0.1.0] - 2026-05-27

### Added

- Health Monitor panel: tree view of MCP servers with live status polling
- Debug Recorder panel: browse, search, and manage debug sessions
- A2A Explorer panel: agent card validation, registry browser, scaffold command
- Status bar indicator showing aggregate MCP server health
- Configuration schema for all three panels
- OpenVSX and VS Code Marketplace publish workflow
