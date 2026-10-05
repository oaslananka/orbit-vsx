# Native MCP Provider Instructions

These instructions apply to `src/mcp/**` and supplement the repository root instructions.

This subtree adapts Orbit's configured companion MCP endpoints into VS Code's native MCP server-definition provider API. It does not implement the companion MCP servers.

## Authority and trust

- Workspace Trust is required before Orbit contributes configured MCP definitions.
- Configuration is read through the canonical config layer.
- Tokens come from SecretStorage-backed runtime state, never plaintext settings.
- A configured URL is not trusted merely because it parses; preserve the repository URL-normalization contract.
- Do not expose bearer tokens through audit details, errors, server labels or diagnostics.

## Provider behavior

- Gracefully degrade when the installed VS Code runtime does not expose the MCP provider API.
- Keep provider registration/disposal tied to the extension lifecycle.
- Config changes should refresh definitions rather than create duplicate registrations.
- Only Health and Debug companion endpoints explicitly supported by the product contract are contributed.
- The extension version attached to definitions must reflect the installed extension package where available.

## Error and audit behavior

- Registration failures must be bounded and recorded through the existing audit path without leaking secrets.
- Do not turn provider registration failure into extension-host crash.
- Add focused contract tests when VS Code MCP API shape, definition construction or Workspace Trust behavior changes.
