# AGENTS.md — Orbit

## Build Commands

| Task               | Command                 |
| ------------------ | ----------------------- |
| Build (dev)        | `pnpm run build`        |
| Build (production) | `pnpm run build:prod`   |
| Watch              | `pnpm run watch`        |
| Typecheck          | `pnpm run typecheck`    |
| Lint               | `pnpm run lint`         |
| Format check       | `pnpm run format:check` |
| Test               | `pnpm test`             |
| Package            | `pnpm run package`      |

## Rules

- Run `typecheck` and `lint` before every commit.
- Never modify `dist/` directly. Build it with esbuild.
- Never modify `CHANGELOG.md` unless bumping a version.
- Never add runtime dependencies to the extension host. Use Node builtins.
- All new commands must be registered in `package.json` contributes AND in the corresponding `commands/*.ts` file.
- All webview HTML must pass the nonce check. Use `getNonce()` from `src/utils/webview.ts`.
- Configuration reads must go through `src/config.ts`, not `vscode.workspace.getConfiguration` directly.
- No `console.log`. Use `Logger` from `src/utils/logger.ts`.

## Adding a New Panel

1. Add view entry to `package.json` under `contributes.views.orbit`
2. Create `src/panels/<name>/` with `<Name>Provider.ts`, `<Name>Client.ts`, `<Name>WebviewPanel.ts`, `types.ts`
3. Create `webview-ui/src/<name>/App.tsx`
4. Add entry point to `esbuild-webview.js`
5. Register provider in `extension.ts`
6. Add commands to `src/commands/<name>.ts` and register in `activate()`
7. Add configuration keys to `package.json` and `src/config.ts`
