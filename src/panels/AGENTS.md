# Companion Panel Instructions

These instructions apply to `src/panels/**` and supplement the repository root instructions. The A2A subtree has more specific rules.

Panels connect extension UI to external companion services and are therefore transport, validation and side-effect boundaries.

## Client contracts

- Normalize configured endpoints before creating clients.
- Validate every MCP/HTTP response shape before converting it into typed UI state.
- Preserve bounded request timeouts and cancellation where supported.
- Bearer tokens are provided from SecretStorage-backed state and must not be logged or embedded into rendered content.
- Keep Health and Debug client behavior aligned with the documented companion-service tool contracts; do not infer fields or statuses from unchecked objects.

## Mutations

Operations such as registering/removing servers, checking all servers, creating/closing debug sessions or recording commands are real companion-service mutations.

- Require the existing Workspace Trust/user-consent behavior.
- Keep audit events for security-relevant operations.
- Do not retry non-idempotent mutations blindly after ambiguous transport failures.
- Surface bounded, redacted errors rather than raw external payloads.

## Panel/webview boundary

- Providers own extension-host orchestration; React components own presentation.
- Serialize only the minimum data needed by the webview.
- Validate messages arriving from the webview before performing extension-host side effects.
- Keep CSP/nonces and escaping through the shared webview helpers.
- Do not duplicate HTTP/MCP parsing rules in React code.

## State and lifecycle

- Refresh/polling loops must remain cancellable and non-overlapping.
- Dispose listeners, timers, clients and webviews with the extension lifecycle.
- Keep stores bounded; do not accumulate unbounded session/history payloads in memory.

## Testing

Client changes need malformed-response tests. Mutation changes need trust/audit/error-path tests. Webview/provider changes need message/payload and extension-host integration coverage.
