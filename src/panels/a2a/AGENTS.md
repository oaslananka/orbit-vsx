# A2A Trust Boundary Instructions

These instructions apply to `src/panels/a2a/**` and supplement the parent panel and root instructions.

A2A Agent Cards, public discovery URLs, registry data, JWKS documents and local CLI output are untrusted security-sensitive inputs.

## Public discovery

- Public Agent Card discovery is HTTPS-only and rejects embedded credentials.
- Resolve and validate DNS before every request; reject non-public/special-use destinations.
- Preserve connection pinning to the validated address while retaining the original hostname for Host/SNI/certificate verification.
- Handle redirects manually, revalidate every hop, reject downgrade/credential/loop/private redirects and keep the existing hop bound.
- Keep body limits enforced before and while buffering. Do not remove the Agent Card size bound.

## Agent Card validation

- Validate schema before trusted rendering.
- Keep legacy and current security representations normalization explicit; reject ambiguous mixed forms.
- Reject credential-looking fields.
- Treat schema validity and cryptographic trust as separate results.

## Signature trust

- Preserve RFC 8785 canonicalization and the supported asymmetric algorithm policy.
- `none` and symmetric `HS*` algorithms remain rejected.
- A verified signature proves payload integrity under an allowed key; it is not an endorsement of the agent/operator/domain.
- Same-origin/trusted-JWKS policy, key status/use/algorithm checks, bounded JWKS fetches and no-redirect behavior must remain fail closed.
- Never write raw signature bytes, protected headers or JWK material to audit output.

## Local CLI

- Running `a2a-warp` requires Workspace Trust.
- Use argument-array process execution with bounded timeout.
- Treat CLI stderr/stdout as untrusted and avoid leaking sensitive workspace paths.
- Scaffold/validate operations must preserve collision and target-path safety.

## Testing

Any discovery, URL, signature, key-policy or validation change requires focused adversarial tests, including malformed, private-network, redirect, Unicode/canonicalization and key-unavailable cases as relevant.
