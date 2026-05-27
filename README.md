# Orbit

A developer companion for MCP and A2A agent infrastructure. Orbit brings three essential tools into VS Code.

## Features

### Health Monitor

Monitor your MCP servers without leaving the editor. See live uptime, latency, and alert status for all registered servers. Integrates with health-monitor-mcp via HTTP.

### Debug Recorder

Your debugging history, searchable. Start sessions, record commands and fix attempts, and search past errors instantly. Integrates with debug-recorder-mcp via HTTP.

### A2A Explorer

Browse your A2A agent registry, validate Agent Card files on save, and scaffold new agents from the command palette. Integrates with a2a-warp via CLI and registry HTTP API.

## Requirements

Each panel requires its corresponding MCP server or tool to be running:

| Panel | Requires |
| --- | --- |
| Health Monitor | `health-monitor-mcp` running at configured endpoint |
| Debug Recorder | `debug-recorder-mcp` running at configured endpoint |
| A2A Explorer | `a2a-warp` CLI installed and registry running |

Panels can be enabled or disabled independently.

## Configuration

See `Preferences -> Settings -> Orbit` for all options.

## License

Apache-2.0
