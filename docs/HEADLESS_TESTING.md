# Headless VS Code Compatibility Testing

Orbit tests the minimum supported VS Code API on pull requests and continuously checks
current VS Code builds so editor releases cannot silently break the extension.

## Local Debian or Ubuntu runner

Install the Electron runtime dependencies once, verify the runner, and execute the same
headless chain used by CI:

```bash
sudo scripts/install-headless-deps.sh
corepack enable
corepack pnpm install --frozen-lockfile
corepack pnpm run check:headless-runner
ORBIT_VSCODE_TEST_VERSION=stable corepack pnpm run verify:headless
```

Use `ORBIT_VSCODE_TEST_VERSION=1.100.0` for the minimum supported editor or
`ORBIT_VSCODE_TEST_VERSION=insiders` for the preview channel.

All package scripts call pnpm through Corepack. This is intentional: a globally installed
or `mise`-provided pnpm shim must not override the exact `packageManager` version declared
in `package.json`.

## Reproducible container

The pinned image in `tools/headless/Dockerfile` installs the same Electron libraries and
runs the complete verification chain from a clean filesystem:

```bash
corepack pnpm run verify:container
ORBIT_VSCODE_TEST_VERSION=1.100.0 corepack pnpm run verify:container
```

The Docker build uses a digest-pinned Node image and fails if the runner check or any
verification step fails. Renovate tracks the image and digest.

## GitHub-hosted compatibility lanes

`.github/workflows/ci.yml` remains the required pull-request and `main` matrix:

- Node 22 with VS Code 1.100.0;
- Node 24 with current VS Code stable.

`.github/workflows/compatibility.yml` runs every Monday and on manual dispatch:

- stable is the authoritative scheduled compatibility lane;
- Insiders is experimental and non-blocking so upstream preview regressions remain
  visible without blocking maintenance work.

Both workflows install runtime libraries through `scripts/install-headless-deps.sh`, use
the repository pnpm version through Corepack, and upload retained extension-host logs on
failure.

## VPS-2 operator procedure

The host-level check is safe and does not install packages:

```bash
corepack pnpm run check:headless-runner
```

When the VPS is intentionally kept minimal or the operator lacks sudo access, use the
container instead of modifying the host:

```bash
ORBIT_VSCODE_TEST_VERSION=stable corepack pnpm run verify:container
```

A rebuilt runner is considered ready only after the Docker verification target succeeds.
Do not treat a successful TypeScript/unit-only run as an extension-host compatibility
result.

## Failure artifacts

`test/runTests.ts` and `test/packageSmoke.ts` persist VS Code log directories and failure
metadata before temporary profiles are removed. The default path is:

```text
.orbit-test-artifacts/
```

CI sets `ORBIT_TEST_ARTIFACTS_DIR` per lane and uploads that directory for failed jobs.
The JSON metadata records the Node version, platform, requested VS Code version, and the
captured error. Tokens are not passed to these test profiles and must never be added to
failure metadata.
