<div align="center">

# Orbit MCP & A2A

**MCP health, debug session intelligence, and A2A trust workflows for VS Code.**<br>
Monitor companion services, inspect Agent Cards, and expose bounded tools to agent mode without leaving the editor.

<p>
  <a href="https://github.com/oaslananka/orbit-vsx/actions/workflows/ci.yml"><img src="https://github.com/oaslananka/orbit-vsx/actions/workflows/ci.yml/badge.svg" alt="CI status"></a>
  <a href="https://github.com/oaslananka/orbit-vsx/actions/workflows/codeql.yml"><img src="https://github.com/oaslananka/orbit-vsx/actions/workflows/codeql.yml/badge.svg" alt="CodeQL status"></a>
  <a href="https://github.com/oaslananka/orbit-vsx/actions/workflows/semgrep.yml"><img src="https://github.com/oaslananka/orbit-vsx/actions/workflows/semgrep.yml/badge.svg" alt="Semgrep status"></a>
  <a href="https://app.codecov.io/gh/oaslananka/orbit-vsx"><img src="https://codecov.io/gh/oaslananka/orbit-vsx/branch/main/graph/badge.svg" alt="Codecov coverage"></a>
  <a href="https://scorecard.dev/viewer/?uri=github.com/oaslananka/orbit-vsx"><img src="https://api.scorecard.dev/projects/github.com/oaslananka/orbit-vsx/badge" alt="OpenSSF Scorecard"></a>
</p>

<p>
  <a href="https://open-vsx.org/extension/oaslananka/orbit-vsx"><img src="https://img.shields.io/open-vsx/v/oaslananka/orbit-vsx?label=Open%20VSX" alt="Open VSX version"></a>
  <a href="https://marketplace.visualstudio.com/items?itemName=oaslananka.orbit-vsx"><img src="https://img.shields.io/badge/VS%20Marketplace-install-blue" alt="Install from Visual Studio Marketplace"></a>
  <a href="https://github.com/oaslananka/orbit-vsx/releases/latest"><img src="https://img.shields.io/github/v/release/oaslananka/orbit-vsx?display_name=tag&sort=semver" alt="Latest GitHub release"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-Apache--2.0-blue" alt="Apache 2.0 license"></a>
</p>

<p>
  <a href="#quick-start">Quick start</a> ·
  <a href="docs/SECURITY_MODEL.md">Security model</a> ·
  <a href="docs/REPOSITORY_GOVERNANCE.md">Governance</a> ·
  <a href="docs/MAINTAINER_ROADMAP.md">Roadmap</a> ·
  <a href="CONTRIBUTING.md">Contributing</a> ·
  <a href="https://github.com/oaslananka/orbit-vsx/discussions">Support</a>
</p>

<p>
  <a href="https://www.buymeacoffee.com/oaslananka"><img src="https://img.shields.io/badge/Buy%20me%20a%20coffee-support-FFDD00?logo=buymeacoffee&logoColor=000000&labelColor=FFDD00&color=111111" alt="Buy me a coffee"></a>
</p>

</div>

Orbit MCP & A2A is the VS Code extension repository for developers operating
MCP and A2A companion services. This repository owns the VS Code extension
surface: editor views, native MCP discovery, configuration, SecretStorage,
Workspace Trust enforcement, validation, redaction, diagnostics, and local
audit output.

Orbit does not start or bundle its companion services. Runtime health data,
debug-session history, and A2A registry state remain the responsibility of the
separately operated `health-monitor-mcp`, `debug-recorder-mcp`, and `a2a-warp`
services.

This repository contains:

- the released `oaslananka.orbit-vsx` VS Code extension;
- React webviews for MCP health, debug sessions, and A2A agent discovery;
- native MCP provider and Language Model Tool integrations;
- Agent Card validation, JWS trust verification, and safe public discovery;
- CI, coverage, workflow-security, provenance, and release automation.

## What Orbit provides

| Surface              | Purpose                                                                                                                 |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| **Health Monitor**   | Track registered MCP servers, availability, latency, uptime, and recent checks.                                         |
| **MCP Explorer**     | Review MCP connection state and contribute configured HTTP endpoints to VS Code's native MCP server list.               |
| **Debug Recorder**   | Create, search, inspect, and optionally auto-track debugging sessions backed by `debug-recorder-mcp`.                   |
| **A2A Explorer**     | Discover agents, inspect Agent Cards, validate local cards, and report schema validity separately from signature trust. |
| **Agent Mode tools** | Expose six bounded, read-only Language Model Tools for MCP health, server inventory, debug context, and A2A trust.      |

## Installation

Install Orbit from either extension registry:

- [Visual Studio Marketplace](https://marketplace.visualstudio.com/items?itemName=oaslananka.orbit-vsx)
- [Open VSX Registry](https://open-vsx.org/extension/oaslananka/orbit-vsx)

A signed release package is also available from
[GitHub Releases](https://github.com/oaslananka/orbit-vsx/releases/latest).
To install a downloaded package from the command line:

```powershell
code --install-extension .\orbit-vsx-0.6.1.vsix
```

The extension identifier is `oaslananka.orbit-vsx`.

## Quick start

1. Install Orbit from the Visual Studio Marketplace, Open VSX, or a release
   `.vsix`.
2. Start only the companion services needed by your workflow:
   - `health-monitor-mcp` for Health Monitor and MCP Explorer;
   - `debug-recorder-mcp` for Debug Recorder;
   - `a2a-warp` and its registry server for A2A Explorer.
3. Open `Preferences -> Settings -> Orbit` and configure the endpoints and CLI
   path for your environment.
4. Store bearer tokens with `Orbit: Health: Set Health Token` and
   `Orbit: Debug: Set Debug Token`. Tokens are stored in VS Code SecretStorage,
   not workspace settings.
5. Open the Orbit Activity Bar container and refresh the enabled views.

If a panel reports a connection error or remains empty, verify that its companion
service is running and reachable from the VS Code extension host.

## Companion services and defaults

| Orbit surface  | Companion dependency                                                  | Default configuration                                                             |
| -------------- | --------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Health Monitor | `health-monitor-mcp` HTTP service with `/health` and `/mcp` endpoints | `orbit.health.endpoint`: `http://127.0.0.1:3000`                                  |
| MCP Explorer   | `health-monitor-mcp` dashboard data                                   | Uses `orbit.health.endpoint` and the SecretStorage health token                   |
| Debug Recorder | `debug-recorder-mcp` HTTP service with `/mcp` endpoint                | `orbit.debug.endpoint`: `http://127.0.0.1:3001`                                   |
| A2A Explorer   | A2A registry HTTP service and `a2a-warp` CLI                          | `orbit.a2a.registryUrl`: `http://127.0.0.1:3099`; `orbit.a2a.cliPath`: `a2a-warp` |

Panels can be enabled or disabled independently from Orbit settings.

## Feature details

### Health Monitor

Health Monitor displays server state, latency, uptime, recent checks, and
pipeline summaries returned by `health-monitor-mcp`. From the tree view you can
register, remove, inspect, and check MCP servers.

### MCP Explorer

MCP Explorer presents the same health dashboard as a connection-focused tree.
Orbit also contributes configured Health and Debug Recorder endpoints through
VS Code's native MCP server definition provider API.

### Debug Recorder

Debug Recorder creates and searches sessions through `debug-recorder-mcp`. It
can record terminal commands and context, keep active/recent sessions bounded,
and optionally mirror VS Code debug-session lifecycle events. Editor decoration
hints and session tracking can be enabled or disabled without reloading VS Code.

### A2A Explorer

A2A Explorer discovers registry agents, inspects Agent Cards, scans local
`agent-card.json` files, validates cards on save, and scaffolds agents with the
configured `a2a-warp` CLI.

Schema validity and cryptographic trust are deliberately separate. Trust states
are:

- `unsigned`
- `unverified`
- `verified`
- `invalid`
- `key-unavailable`

Orbit supports bounded ES256 and RS256 JWS verification against same-origin or
explicitly trusted public HTTPS JWKS endpoints. See
[the security model](docs/SECURITY_MODEL.md) for the exact policy and
limitations.

### Agent Mode tools

Orbit contributes these read-only VS Code Language Model Tools:

- `orbit_get_mcp_health`
- `orbit_list_mcp_servers`
- `orbit_search_debug_sessions`
- `orbit_get_debug_session_context`
- `orbit_list_a2a_agents`
- `orbit_validate_agent_card`

The tools return bounded JSON text, redact URLs, honor cancellation, require
Workspace Trust where necessary, and record security-relevant invocations in the
`Orbit:Audit` output channel.

## Configuration

Open `Preferences -> Settings -> Orbit` to view all settings. Common first-run
settings and commands are:

| Setting or command                    | Purpose                                                          |
| ------------------------------------- | ---------------------------------------------------------------- |
| `orbit.health.endpoint`               | Base URL for `health-monitor-mcp`.                               |
| `Orbit: Health: Set Health Token`     | Store the optional health bearer token in VS Code SecretStorage. |
| `orbit.health.pollingIntervalSeconds` | Configure cancellable, non-overlapping health polling.           |
| `orbit.debug.endpoint`                | Base URL for `debug-recorder-mcp`.                               |
| `Orbit: Debug: Set Debug Token`       | Store the optional debug bearer token in VS Code SecretStorage.  |
| `orbit.debug.autoTrackVscodeSessions` | Mirror VS Code debug-session start and stop events.              |
| `orbit.debug.showEditorDecorations`   | Show live session-frequency hints in eligible editors.           |
| `orbit.a2a.registryUrl`               | Base URL for the A2A registry server.                            |
| `orbit.a2a.cliPath`                   | Executable name or absolute path for `a2a-warp`.                 |
| `orbit.a2a.trustedJwksUrls`           | Exact public HTTPS JWKS URLs trusted for card verification.      |

Example workspace settings:

```json
{
  "orbit.health.endpoint": "http://127.0.0.1:3000",
  "orbit.debug.endpoint": "http://127.0.0.1:3001",
  "orbit.a2a.registryUrl": "http://127.0.0.1:3099",
  "orbit.a2a.cliPath": "a2a-warp"
}
```

Use user or workspace settings only for non-secret values. Do not put bearer
tokens in shared workspace files; use Orbit's SecretStorage commands.

## Commands and usage

Open the Orbit Activity Bar view after configuring the companion services. View
title buttons, item context menus, editor context menus, and the Command Palette
provide the main actions.

Common operations include:

- refresh Health Monitor, Debug Recorder, A2A Explorer, and MCP Explorer;
- add, remove, inspect, and check MCP servers;
- create, close, search, and annotate debug sessions;
- discover agents, validate an `agent-card.json`, scaffold an agent, and open
  Agent Cards;
- set or clear Health and Debug bearer tokens securely.

## Security and trust

Orbit treats companion services, workspace files, local CLIs, webviews, public
URLs, JWKS documents, and discovered Agent Cards as separate trust boundaries.
The extension applies Workspace Trust gates, SecretStorage migration, bounded
network reads, DNS and redirect validation, strict webview CSP, typed audit
records, and redacted error output.

Read:

- [Security model](docs/SECURITY_MODEL.md)
- [Security policy](SECURITY.md)
- [Security tooling](docs/SECURITY_TOOLING.md)
- [Repository governance](docs/REPOSITORY_GOVERNANCE.md)

Release VSIX files, checksums, and SPDX SBOMs are published with GitHub artifact
attestations. Verification instructions are documented in
[`docs/RELEASE_GOVERNANCE.md`](docs/RELEASE_GOVERNANCE.md).

## Troubleshooting

### A panel shows "Connection error"

Confirm the matching companion service is running and reachable from VS Code.
Health Monitor and MCP Explorer use `orbit.health.endpoint`; Debug Recorder uses
`orbit.debug.endpoint`; A2A Explorer uses `orbit.a2a.registryUrl`.

### Requests return unauthorized responses

Set or replace the matching token through the Orbit Command Palette commands.
Clear the token when the service does not require authentication. Legacy
plaintext settings are migrated to SecretStorage and cleared from configuration
scopes.

### An endpoint is wrong or times out

Use the complete base URL, including protocol and port, such as
`http://127.0.0.1:3000`. For containers and remote environments, expose or
forward the port so it is reachable from the extension host.

### A view is empty

An empty view usually means the service is reachable but has no records yet.
Register an MCP server, start a debug session, or add agents to the A2A registry.
Also verify that the view's `*.enabled` setting remains enabled.

### A2A validation or scaffolding cannot find the CLI

Install `a2a-warp` or set `orbit.a2a.cliPath` to its absolute path. Refresh A2A
Explorer after changing the path.

## Development and verification

Orbit uses pnpm through the package-manager version declared in `package.json`.
Install dependencies and run the repository verification chain:

```bash
corepack enable
corepack pnpm install --frozen-lockfile
corepack pnpm run verify
```

For Linux/headless environments:

```bash
corepack pnpm run verify:headless
```

The VS Code extension-host version can be pinned explicitly:

```bash
ORBIT_VSCODE_TEST_VERSION=1.100.0 corepack pnpm test
ORBIT_VSCODE_TEST_VERSION=stable corepack pnpm test
```

CI tests the minimum supported VS Code baseline with Node 22 and current stable
VS Code with Node 24. Coverage, JUnit Test Analytics, production bundle size,
CodeQL, Semgrep, dependency review, workflow security, and a clean headless
container are also verified on pull requests.

## Maintainer resources

- [Changelog](CHANGELOG.md)
- [Maintainer roadmap](docs/MAINTAINER_ROADMAP.md)
- [Dependency policy](docs/DEPENDENCY_POLICY.md)
- [Repository governance](docs/REPOSITORY_GOVERNANCE.md)
- [Release governance](docs/RELEASE_GOVERNANCE.md)
- [Observability and privacy](docs/OBSERVABILITY_PRIVACY.md)
- [Headless testing](docs/HEADLESS_TESTING.md)
- [Codecov integration](docs/CODECOV.md)

## Contributing

Read [CONTRIBUTING.md](CONTRIBUTING.md) for development setup, verification
commands, and pull request expectations. Questions and support requests can be
opened in [GitHub Discussions](https://github.com/oaslananka/orbit-vsx/discussions).

## License

Orbit MCP & A2A is available under the [Apache License 2.0](LICENSE).
