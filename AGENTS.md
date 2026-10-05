# Orbit Agent Instructions

These instructions apply repository-wide. A nested `AGENTS.md` may add or narrow rules for its subtree; the closest applicable file wins for local implementation details.

Nested instructions may not weaken repository-wide security, workspace-trust, release, packaging, provenance, product-truth, or evidence constraints unless the underlying policy is intentionally changed in the same work.

## Product boundary

This repository publishes the `oaslananka.orbit-vsx` VS Code extension.

Orbit connects VS Code to separately operated companion services:

- `health-monitor-mcp`;
- `debug-recorder-mcp`;
- A2A registry/discovery services and the local `a2a-warp` CLI.

Those services own their server-side state and authorization models. This repository owns the VS Code extension surface: configuration, SecretStorage, Workspace Trust, MCP definitions, client validation, A2A trust workflows, webviews, Language Model Tools, audit output, packaging and marketplace release automation.

Do not copy companion-service implementation into this repository or treat a successful transport connection as proof that returned data is trustworthy.

## Nested boundaries

Read the closest relevant file before editing:

- `.github/AGENTS.md` — CI, workflow security, release, provenance and marketplace publishing.
- `src/mcp/AGENTS.md` — native VS Code MCP server-definition provider boundary.
- `src/panels/AGENTS.md` — companion-service clients, panel providers, side effects and webview orchestration.
- `src/panels/a2a/AGENTS.md` — public A2A discovery, Agent Card validation and JWS trust.
- `webview-ui/AGENTS.md` — React webview rendering and browser-side trust boundary.

Do not add one nested file per panel or command. Add another boundary only when authority or trust semantics materially differ.

## First reads

Before changing behavior, read the relevant source/tests plus:

- `README.md`
- `docs/SECURITY_MODEL.md`
- `docs/REPOSITORY_GOVERNANCE.md`
- `RELEASING.md`
- `SECURITY.md`

## Toolchain and verification

Use the checked-in pnpm contract and frozen lockfile.

```bash
corepack pnpm install --frozen-lockfile
corepack pnpm run typecheck
corepack pnpm run lint
corepack pnpm test
corepack pnpm run build
corepack pnpm run package
```

The repository's complete headless verification and CI are authoritative for exact-head evidence. Run focused tests first, then the broader gate appropriate to the touched boundary.

Do not lower coverage, security, package, workflow, audit, compatibility, or release controls merely to make unrelated work green.

## Workspace Trust and secrets

Workspace content, configured endpoints, local CLI paths, MCP responses, registry responses, Agent Cards, JWKS documents and webview-bound content are untrusted inputs.

- Operations that read workspace files, run local CLIs, perform discovery, or mutate companion-service state must preserve the documented Workspace Trust gate.
- Menu visibility is not a security boundary.
- Bearer tokens belong in VS Code SecretStorage. Do not add plaintext settings fallback for secrets.
- Keep legacy-token migration one-way into SecretStorage and clear stale plaintext settings.
- Logs and diagnostics must redact bearer tokens, URL credentials, sensitive query values, credential-looking Agent Card fields and unnecessary private paths.
- Use the existing structured audit path for security-relevant operations; audit logs are diagnostic evidence, not tamper-proof compliance logs.

## Networking and external data

- Normalize and validate configured URLs before use.
- Preserve bounded timeouts, response-size limits, JSON/runtime validation and cancellation.
- Public A2A discovery has stricter SSRF/DNS/redirect requirements; follow the nested A2A instructions.
- Health and Debug companion endpoints are user-configured private/local services; do not silently apply public-internet trust assumptions to them or vice versa.
- Treat MCP JSON-RPC result objects as untrusted and validate method-specific shapes before use.

## VS Code contribution contract

Changes to commands, views, activation events, settings, MCP providers, Language Model Tools, menus, icons or configuration must keep `package.json`, constants, registration code, tests and docs aligned.

Configuration reads must go through `src/config.ts`, not ad hoc `vscode.workspace.getConfiguration` calls.

Use `Logger`/existing audit facilities instead of `console.log` in extension-host code.

## Webviews

- All webview HTML uses nonce-based CSP and minimal local resource roots.
- Escape or safely serialize project-, provider-, registry- and service-controlled data.
- Do not add `eval`, `new Function`, arbitrary remote scripts or CSP bypasses.
- Keep webview message types narrow and validate extension-host inputs.
- UI changes require relevant webview/security/accessibility tests.

## Build and package boundary

- Never modify `dist/**` directly; build with the repository esbuild scripts.
- `AGENTS.md` files are repository governance metadata and must not ship in the VSIX.
- Do not widen package contents to accommodate development-only files.
- Generated bundles, SBOMs, checksums and attestations must correspond to the same source identity.

## Adding a new panel

1. Add the view entry to `package.json`.
2. Create the panel/provider/client/types under `src/panels/<name>/`.
3. Add the React entry under `webview-ui/src/<name>/`.
4. Add the webview build entry to `esbuild-webview.js`.
5. Register the provider in the extension lifecycle.
6. Add commands and contribution metadata.
7. Add configuration keys through `src/config.ts`.
8. Add runtime validation, Workspace Trust and audit behavior appropriate to the panel's authority.

## Release and GitHub rules

- Changes reach `main` through PRs and the repository's required checks.
- Preserve full-SHA action pinning, least-privilege permissions and non-persistent checkout credentials.
- Publish only through protected release workflows.
- Release VSIX, checksum, SBOM and attestations must bind to the same source/tag.
- Do not merge or edit automation-owned release changes unless the task explicitly concerns release automation.

## Definition of done

A change is ready when the implementation, closest agent boundary, focused tests, contribution/package contract, docs and exact-head CI agree. State clearly which environment-dependent or marketplace checks were not executed.
