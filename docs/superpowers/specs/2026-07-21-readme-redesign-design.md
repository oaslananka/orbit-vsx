# Orbit README Redesign

## Goal

Make the repository landing page communicate Orbit's product identity, install paths, trust posture, and operating model within the first screen while preserving the current technical detail needed by users and maintainers.

## Chosen direction

Use the KiCad Studio Kit README's centered hero hierarchy as the visual reference, adapted to Orbit rather than copied mechanically:

1. centered product name and two-line value proposition;
2. live repository-quality badges;
3. marketplace, license, release, and documentation badges;
4. compact navigation links;
5. sponsorship below product identity;
6. a short repository-boundary statement before detailed feature and setup content.

## Content architecture

The README will use this order:

1. Hero, badges, navigation, sponsorship
2. Product and repository boundary
3. Feature overview
4. Installation and quick start
5. Companion-service requirements
6. Configuration and commands
7. Security and trust model
8. Troubleshooting
9. Development verification and maintainer documentation
10. Contributing and license

## Badge policy

Badges must link to real Orbit resources and must not imply capabilities the repository does not have.

- CI: `.github/workflows/ci.yml`
- CodeQL: `.github/workflows/codeql.yml`
- Semgrep: `.github/workflows/semgrep.yml`
- Codecov: `oaslananka/orbit-vsx`
- OpenSSF Scorecard: `github.com/oaslananka/orbit-vsx`
- Open VSX: publisher `oaslananka`, extension `orbit-vsx`
- Visual Studio Marketplace: item `oaslananka.orbit-vsx`
- License: Apache-2.0
- GitHub Release: latest release page

No OpenSSF Best Practices badge or documentation-site badge will be added unless a real project/site exists.

## Product truth

Orbit is a VS Code extension and does not start or own its companion services. It provides editor-side UI, SecretStorage, Workspace Trust enforcement, validation, redaction, local audit output, native MCP provider integration, and six read-only Language Model Tools. Companion services remain independently operated runtime dependencies.

## Copy and visual constraints

- Keep prose in English to match the existing package and marketplace copy.
- Avoid emoji-heavy headings and marketing superlatives.
- Keep the hero compact enough to render well on GitHub and the VS Code Marketplace.
- Use raw HTML only for alignment and badges; keep the body standard Markdown.
- Keep every existing configuration key, command behavior, trust state, and verification command factually intact.
- Move the large Buy Me a Coffee image to a compact shield beneath navigation.

## Testing

Add a README contract test that verifies:

- centered hero and required product copy;
- badge workflow paths and external product identifiers;
- package version alignment in installation examples;
- links to governance, security, support, contributing, changelog, and maintainer roadmap;
- explicit companion-service boundary;
- no unsupported Best Practices or docs-site claims.

Run formatting, TypeScript test compilation, targeted README/version/manifest contracts, all unit tests, coverage, package smoke, and pre-commit checks.
