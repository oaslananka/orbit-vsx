# Codecov Quality Observability

Orbit publishes three independent quality signals to the connected Codecov project:

1. **Coverage** — c8 emits `coverage/lcov.info` for the TypeScript extension runtime.
2. **Test Analytics** — Mocha emits `.test-results/junit.xml` for duration, failure, and flaky-test history.
3. **Bundle Analysis** — Codecov's generic analyzer measures the production `dist/` tree produced by Orbit's custom esbuild pipeline, including the extension bundle and the A2A, Debug, and Health webview bundles.

## Authentication and permissions

The `.github/workflows/codecov.yml` workflow uses GitHub OpenID Connect. It does not read `CODECOV_TOKEN` or any other repository secret. The workflow has read-only repository access at the top level and grants `id-token: write` only to its Codecov job.

The checkout uses full history so Codecov can associate pull-request and merge commits accurately. All upload actions are pinned to immutable commit SHAs, and the generic bundle analyzer is an exact development dependency.

## Enforcement model

The existing `.c8rc.json` minimums remain blocking in local verification and CI:

- Lines: 70%
- Statements: 70%
- Functions: 70%
- Branches: 55%

Codecov project, patch, and bundle statuses start in informational mode while a stable baseline is established. Upload failures still fail the dedicated workflow. Promote a Codecov status to branch protection only after multiple successful `main` and pull-request runs demonstrate stable naming and behavior.

## Local verification

Generate the LCOV and JUnit reports:

```bash
corepack pnpm run quality:reports
```

Build and inspect the production bundle report without uploading it:

```bash
corepack pnpm run build:prod
corepack pnpm exec bundle-analyzer ./dist   --bundle-name=orbit-vsx-production   --config-file=./codecov-bundle.config.json   --dry-run
```

Generated coverage and test-result directories are ignored by Git and excluded from the packaged VSIX. Test reports must not contain credentials or environment dumps.
