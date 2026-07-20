# Orbit Security Model

Orbit is a VS Code extension that connects the editor to companion MCP, Debug
Recorder, and A2A services. This document defines the trust boundaries, runtime
controls, and audit expectations for Orbit features.

## Trust boundaries

| Boundary                    | Trusted by default?     | Controls                                                                                           |
| --------------------------- | ----------------------- | -------------------------------------------------------------------------------------------------- |
| VS Code extension host      | Yes, after installation | TypeScript strict mode, CI, package smoke tests, VSIX allowlist checks                             |
| Workspace files             | No                      | VS Code Workspace Trust gates file scanning, auto-validation, CLI execution, and network discovery |
| Health Monitor MCP endpoint | User-configured         | URL normalization, SecretStorage token retrieval, JSON-RPC envelope/result validation              |
| Debug Recorder MCP endpoint | User-configured         | URL normalization, SecretStorage token retrieval, JSON-RPC envelope/result validation              |
| A2A registry endpoint       | User-configured         | URL normalization, registry response validation, Agent Card validation before rendering            |
| Discovered Agent Card URL   | No                      | Public HTTPS, manual redirects, DNS/IP policy checks, pinned TLS connection, bounded response body |
| Local A2A CLI               | No                      | Workspace Trust required, bounded timeout, selected workspace cwd, collision checks for scaffold   |
| Webviews                    | No direct trust         | CSP, nonce scripts, local resource roots, command allowlist, escaped/serialized data               |

## Data handling principles

- Bearer tokens are stored in VS Code SecretStorage through Orbit commands, not in
  repository files.
- Audit output must not include bearer tokens, URL credentials, query parameter
  values, command stdout containing secrets, or raw Agent Card credential fields.
- Network error messages use redacted URLs.
- Untrusted Agent Card discovery resolves every hostname before each request, rejects
  the destination if any answer is non-public, and connects to a validated IP while
  preserving the original hostname for HTTP Host, SNI, and certificate verification.
- Redirects are handled manually, revalidated at every hop, limited to five hops,
  and rejected on loops, HTTP downgrade, credentials, or non-public destinations.
- Agent Card response bodies are limited to 256 KiB while streaming; oversized
  `Content-Length` values are rejected before body buffering.
- A2A Agent Cards are validated before trusted rendering. Cards must not include
  credential material such as access keys, passwords, private keys, or tokens.
- Local `agent-card.json` scans are limited by `orbit.a2a.localCardScanLimit` and
  excluded by `orbit.a2a.localCardExcludeGlob`.

## User consent and Workspace Trust

Orbit requires Workspace Trust before it performs operations that read workspace
files, run local CLIs, or contact user-supplied discovery URLs. In an untrusted
workspace, affected views show a trust error and commands return before taking
side effects.

Mutating operations should either be initiated directly by the user from a
command or require a confirmation prompt. Current mutating operations include:

- registering or removing an MCP server;
- running all health checks;
- creating, closing, or appending to debug sessions;
- validating or scaffolding A2A agents with the local CLI;
- fetching a user-supplied Agent Card URL.

## Runtime validation

Orbit validates MCP JSON-RPC responses and A2A Agent Cards at runtime because
both are external inputs.

MCP JSON-RPC validation checks:

- JSON-RPC 2.0 envelope shape;
- request/response id matching;
- result vs. error exclusivity;
- server error code and message shape;
- method-specific Health and Debug result objects.

A2A discovery transport checks:

- HTTPS-only URLs with no embedded credentials;
- manual, bounded redirect handling with destination revalidation;
- all DNS answers against blocked IPv4 and IPv6 special-use ranges;
- connection pinning to a checked address with hostname-based TLS verification;
- early and streaming enforcement of the Agent Card byte limit.

A2A validation checks:

- A2A 1.0 ProtoJSON security-scheme oneof wrappers (`apiKeySecurityScheme`,
  `httpAuthSecurityScheme`, `oauth2SecurityScheme`,
  `openIdConnectSecurityScheme`, and `mtlsSecurityScheme`);
- canonical `securityRequirements[].schemes` scope lists and the
  `capabilities.extendedAgentCard` capability;
- explicit normalization of supported pre-1.0 `type`-discriminated security
  schemes and the legacy `security` field before downstream use;
- rejection of mixed or ambiguous legacy/current security representations;
- required Agent Card metadata;
- `supportedInterfaces`, `capabilities`, input/output modes, and skills;
- public HTTPS URLs for discovered cards and card-declared endpoints;
- security scheme shapes;
- signatures metadata shape when present;
- absence of credential-looking fields.

### Agent Card signature trust

Schema validity and signature trust are independent results. A schema-valid card may
still be unsigned, may use an unavailable key, or may contain an invalid signature.
Orbit exposes the following trust states in the A2A tree, detail webview, local
diagnostics, Language Model Tools, and audit qualifiers:

- `unsigned`: no signatures were supplied;
- `unverified`: a signature exists but uses a safe algorithm or critical header Orbit
  does not currently support;
- `verified`: at least one ES256 or RS256 JWS signature verifies against the RFC 8785
  canonical Agent Card payload;
- `invalid`: the protected header, algorithm, canonical payload, or signature is unsafe,
  malformed, conflicting, or cryptographically invalid;
- `key-unavailable`: the protected key URL is missing, untrusted, unavailable, or the
  matching key is absent, expired, revoked, inactive, incompatible, or not authorized
  for verification.

Verification excludes the `signatures` field, omits empty optional repeated fields
according to A2A field-presence rules, and canonicalizes the remaining JSON with RFC 8785. Orbit rejects non-finite numbers and unpaired Unicode surrogates before signature
verification. The protected JWS header must contain `alg`, `typ: JOSE`, and `kid`.
`none` and symmetric `HS*` algorithms are rejected; the current asymmetric allowlist is
ES256 and RS256. Raw signature bytes, protected headers, and JWK material are never
written to `Orbit:Audit`.

A discovered card may resolve a public HTTPS JWKS URL only when it is same-origin with
the discovered Agent Card URL. Local and registry cards require the exact key URL in
`orbit.a2a.trustedJwksUrls`. JWKS redirects are disabled, responses are bounded, and
DNS/private-address protections are inherited from the hardened public JSON fetcher.
Successfully parsed JWKS responses are cached for five minutes; failures are not
cached. Expired, revoked, inactive, private, symmetric, algorithm-mismatched, or
non-verification keys are never used.

`verified` means payload integrity was proven under a key allowed by this local policy.
It is not an independent endorsement of the organization controlling the agent, domain,
or key. Operators remain responsible for deciding which JWKS URLs and provider domains
they trust.

## Audit log

Orbit writes security-relevant user actions to the `Orbit:Audit` output channel.
Audit logs are best-effort local diagnostics, not tamper-proof compliance logs.
They are intended to help a developer answer: what side-effecting action was
requested, which surface executed it, what target was involved, and whether it
succeeded.

Current audited surfaces:

| Surface     | Operations                                                     |
| ----------- | -------------------------------------------------------------- |
| MCP/Health  | `register_server`, `unregister_server`, `check_all`            |
| Debug       | `start_debug_session`, `close_debug_session`, `record_command` |
| A2A network | `discover_agent_card`                                          |
| A2A trust   | `verify_agent_card_signature`                                  |
| A2A CLI     | `validate_agent_card`, `scaffold_agent`                        |

The transport prevents DNS rebinding between policy evaluation and connection by
using the checked IP directly. It cannot prevent a legitimate public server from
proxying requests to its own internal resources; server-side behavior remains outside
the extension's trust boundary. User-configured registry endpoints intentionally keep
their existing private-network policy and do not use this untrusted-discovery path.

Audit event fields:

- `surface`: logical area such as `mcp`, `debug`, `network`, or `cli`;
- `operation`: short operation identifier;
- `outcome`: `started`, `success`, `failure`, or `blocked`;
- `target_kind`: declared target type: `url`, `path`, `server`, `session`, or `identifier`;
- `target`: URL-redacted value or a sanitized non-URL identifier appropriate to `target_kind`;
- `detail`: small non-secret qualifier such as adapter type or `trust:<state>`.

All audit fields remove control characters, collapse whitespace, encode field separators,
and enforce length limits so external values cannot inject extra lines or fields. The
Audit output channel is disposed with the extension lifecycle.

## Release checks for security-sensitive changes

Security-sensitive PRs must pass:

```bash
pnpm audit --audit-level moderate
pnpm run verify:headless
```

GitHub checks must also pass for the Node/VS Code matrix, CodeQL, dependency
review, and supply-chain scanning.

## References

- VS Code MCP extension guide: https://code.visualstudio.com/api/extension-guides/ai/mcp
- VS Code Language Model Tool API: https://code.visualstudio.com/api/extension-guides/ai/tools
- VS Code Workspace Trust guide: https://code.visualstudio.com/api/extension-guides/workspace-trust
- MCP specification: https://modelcontextprotocol.io/specification/2025-06-18
- A2A Agent Card specification: https://a2a-protocol.org/latest/specification/
