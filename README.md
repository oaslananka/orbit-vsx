# Orbit MCP & A2A

<p align="center">
  <a href="https://www.buymeacoffee.com/oaslananka">
    <img src="https://img.buymeacoffee.com/button-api/?text=Buy%20me%20a%20coffee&emoji=%E2%98%95&slug=oaslananka&button_colour=FFDD00&font_colour=000000&font_family=Arial&outline_colour=000000&coffee_colour=ffffff" alt="Buy me a coffee" />
  </a>
</p>

Orbit brings MCP health monitoring, debug session history, and A2A agent discovery
into the VS Code Activity Bar. It is built for developers who run companion agent
services locally or on a private network and want their status, sessions, and
agent cards visible without leaving the editor.

## Installation

Install Orbit from the VS Code Marketplace, Open VSX, or a GitHub Release
artifact. To install a downloaded package from the command line:

```powershell
code --install-extension .\orbit-vsx-0.6.0.vsix
```

## Product architecture

Orbit connects editor views to external companion services. The extension owns VS Code UI, validation, SecretStorage, Workspace Trust, and local audit output. Companion services own runtime state.

## Features

### Health Monitor

Track registered MCP servers from VS Code. The Health Monitor shows server
status, latency, uptime, and recent checks from a `health-monitor-mcp` HTTP
service.

### Debug Recorder

Create and search debugging sessions backed by `debug-recorder-mcp`. Use it to
record terminal commands, fix attempts, and session context while you work.

### A2A Explorer

Browse an A2A registry, inspect agent cards, validate `agent-card.json` files on
save, and scaffold agents through the configured `a2a-warp` CLI.

### MCP Explorer

Review MCP connection status in a dedicated tree view. MCP Explorer reads the
same `health-monitor-mcp` dashboard data as Health Monitor and presents the
connections as quick-scannable entries. When VS Code exposes its native MCP
server definition provider API, Orbit also contributes configured Health and
Debug Recorder MCP endpoints to VS Code's MCP server list.

### Agent Mode tools

Orbit contributes read-only VS Code Language Model Tools for agent workflows:

- `orbit_get_mcp_health`
- `orbit_list_mcp_servers`
- `orbit_search_debug_sessions`
- `orbit_get_debug_session_context`
- `orbit_list_a2a_agents`
- `orbit_validate_agent_card`

The tools return bounded JSON text, redact URLs, require Workspace Trust, and
write security-relevant invocations to the `Orbit:Audit` output channel.

## Quick Start

1. Install Orbit from the VS Code Marketplace or from a packaged `.vsix`.
2. Start the companion services you want to use:
   - `health-monitor-mcp` for Health Monitor and MCP Explorer.
   - `debug-recorder-mcp` for Debug Recorder.
   - `a2a-warp` plus its registry server for A2A Explorer.
3. Open `Preferences -> Settings -> Orbit` and set the endpoints and CLI
   path that match your local environment. Store bearer tokens with the
   `Orbit: Health: Set Health Token` and `Orbit: Debug: Set Debug Token` commands.
4. Open the Orbit Activity Bar view and use each panel's refresh action to load
   current data.

Orbit does not start companion services for you. If a panel shows a connection
error or an empty state, confirm the matching service is running first.

## Requirements

| Orbit view     | Required companion service                                            | Default setting                                                                   |
| -------------- | --------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Health Monitor | `health-monitor-mcp` HTTP service with `/health` and `/mcp` endpoints | `orbit.health.endpoint`: `http://127.0.0.1:3000`                                  |
| MCP Explorer   | `health-monitor-mcp` dashboard data                                   | Uses `orbit.health.endpoint` and `orbit.health.token`                             |
| Debug Recorder | `debug-recorder-mcp` HTTP service with `/mcp` endpoint                | `orbit.debug.endpoint`: `http://127.0.0.1:3001`                                   |
| A2A Explorer   | A2A registry HTTP service and `a2a-warp` CLI                          | `orbit.a2a.registryUrl`: `http://127.0.0.1:3099`; `orbit.a2a.cliPath`: `a2a-warp` |

Panels can be enabled or disabled independently from Orbit settings.

## Configuration

Open `Preferences -> Settings -> Orbit` for all settings. The most common
first-run settings are:

| Setting                           | Purpose                                                                         |
| --------------------------------- | ------------------------------------------------------------------------------- |
| `orbit.health.endpoint`           | Base URL for `health-monitor-mcp`.                                              |
| `Orbit: Health: Set Health Token` | Stores the optional `health-monitor-mcp` bearer token in VS Code SecretStorage. |
| `orbit.debug.endpoint`            | Base URL for `debug-recorder-mcp`.                                              |
| `Orbit: Debug: Set Debug Token`   | Stores the optional `debug-recorder-mcp` bearer token in VS Code SecretStorage. |
| `orbit.a2a.registryUrl`           | Base URL for the A2A registry server.                                           |
| `orbit.a2a.cliPath`               | Executable name or absolute path for `a2a-warp`.                                |

Example workspace settings:

```json
{
  "orbit.health.endpoint": "http://127.0.0.1:3000",
  "orbit.debug.endpoint": "http://127.0.0.1:3001",
  "orbit.a2a.registryUrl": "http://127.0.0.1:3099",
  "orbit.a2a.cliPath": "a2a-warp"
}
```

Use VS Code's user or workspace settings for non-secret endpoints. Store bearer
tokens only through Orbit's SecretStorage commands; do not add token keys to a
shared workspace file.

## Usage

Open the Orbit Activity Bar view after configuring the companion services. Each
panel exposes its primary actions from the view title and item context menus.

### Commands

Orbit contributes refresh and action commands for the Health, Debug, A2A, MCP,
and Sessions views. Most commands are available from the Orbit view title buttons
or from the Command Palette under their Orbit category.

Common actions:

- Refresh Health Monitor, Debug Recorder, A2A Explorer, MCP Explorer, or Sessions.
- Add, remove, inspect, and check MCP servers from Health Monitor.
- Start, close, search, and record commands in Debug Recorder sessions.
- Discover agents, validate an `agent-card.json`, scaffold an agent, and open
  agent cards from A2A Explorer.

## Security model

Orbit treats companion services, workspace files, local CLIs, webviews, and
discovered Agent Cards as separate trust boundaries. See
[`docs/SECURITY_MODEL.md`](docs/SECURITY_MODEL.md) for Workspace Trust behavior,
SecretStorage expectations, runtime validation rules, and the `Orbit:Audit`
output channel.

## Troubleshooting

### A panel shows "Connection error"

Confirm the companion service for that panel is running and reachable from VS
Code. Health Monitor and MCP Explorer use `orbit.health.endpoint`; Debug
Recorder uses `orbit.debug.endpoint`; A2A Explorer uses `orbit.a2a.registryUrl`.

### Requests return unauthorized responses

Check the matching token setting. `orbit.health.token` and `orbit.debug.token`
are sent as bearer tokens when configured. Remove the token if the companion
service does not require authentication, or update it if the service token
changed.

### The endpoint is wrong or times out

Use the full base URL, including protocol and port, such as
`http://127.0.0.1:3000`. If your service runs in a container or remote
environment, make sure the port is forwarded and reachable from VS Code.

### A view is empty

Empty views usually mean the service is reachable but has no data yet. Register
an MCP server in Health Monitor, start or record a debug session in Debug
Recorder, or add agents to the A2A registry. Also check that the panel's
`*.enabled` setting is still turned on.

### A2A validation or scaffolding cannot find the CLI

Install `a2a-warp` or set `orbit.a2a.cliPath` to the executable's absolute path.
Restart VS Code or refresh A2A Explorer after changing the CLI path.

## Local verification

Run the same verification chain used by CI:

```bash
pnpm run verify
```

For Linux/headless environments, use:

```bash
pnpm run verify:headless
```

The VS Code test host can be pinned with `ORBIT_VSCODE_TEST_VERSION`. CI runs
the minimum supported VS Code API baseline with Node 22 and the current stable
VS Code build with Node 24:

```bash
ORBIT_VSCODE_TEST_VERSION=1.100.0 pnpm test
ORBIT_VSCODE_TEST_VERSION=stable pnpm test
```

Orbit declares `engines.node >=22.0.0`; Node 22 is the minimum runtime lane and
Node 24 is the current maintainer lane.

## Maintainer documentation

See the files in `docs/` for dependency policy, security tooling, release governance, observability/privacy, and maintainer roadmap details.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup, verification
commands, and pull request expectations.

## License

Apache-2.0
