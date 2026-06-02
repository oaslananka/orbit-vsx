# Security Policy

## Supported Versions

Orbit supports the latest published extension version and the current `main` branch.
Older release lines are not maintained separately unless a security fix requires a
patch release for a still-installed Marketplace or Open VSX version.

| Version | Supported |
| ------- | --------- |
| 0.5.x   | Yes       |
| < 0.5   | No        |

## Reporting a Vulnerability

Do not open a public issue with exploit details, credentials, tokens, private
URLs, screenshots containing secrets, or proof-of-concept payloads.

Use one of these private routes:

1. Open a private GitHub vulnerability report from the repository Security tab:
   `https://github.com/oaslananka/orbit-vsx/security/advisories/new`
2. If that route is unavailable, contact the maintainer through GitHub:
   `https://github.com/oaslananka`

Include:

- Affected Orbit version or commit.
- The affected surface, such as extension host, webview, CI/CD, packaging, or
  companion-service integration.
- Reproduction steps with the minimum sensitive detail needed to verify impact.
- Expected impact and any known mitigations.

## Response Process

The maintainer will acknowledge actionable reports when they are received,
triage severity, prepare a fix on a private or restricted branch when needed,
and publish coordinated remediation notes after the fix is available.

Security fixes should pass the same release checks as normal changes: lint,
typecheck, tests, build, package verification, secret scanning, and CI.
