# Observability and Telemetry Privacy Plan

Orbit currently uses local VS Code output channels and does not send telemetry to third-party analytics services.

## Current observability surfaces

- `Orbit` output channel for activation and configuration lifecycle messages.
- `Orbit:Audit` output channel for security-relevant operations such as tool invocation, CLI execution, and network/discovery actions.
- UI empty states and error messages inside tree views and webviews.

## Privacy principles

- No telemetry is sent by default.
- Tokens must never be logged.
- Audit targets carry an explicit type. URL targets redact credentials, query values,
  and fragments; path, server, session, and identifier targets remain useful after
  control-character and field-separator sanitization.
- Legacy plaintext token settings are removed from global, workspace, and workspace-folder
  scopes whenever SecretStorage becomes authoritative.
- Agent Card contents, debug session text, and terminal commands remain local unless a user explicitly sends them to a configured companion service.
- Any future telemetry must be opt-in, documented, and scoped to product-quality metrics rather than payload content.

## Future opt-in metrics candidates

If maintainers later add telemetry, only aggregate counters should be considered:

- command invocation counts by command id
- panel activation counts
- success/failure counts by feature area
- coarse latency buckets for companion service calls

The following data must not be collected:

- bearer tokens or secrets
- raw URLs with credentials or query strings
- debug session text
- terminal command content
- Agent Card payloads
- workspace file contents

## Audit log retention

Audit output is a local VS Code output channel. Users control retention through VS Code session/log handling and may clear the output channel at any time.
