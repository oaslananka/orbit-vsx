## Summary

Successfully completed the security remediation for PR #169 (round 2) by replacing the git URL override for `braces` with a local `pnpm patch`, as recommended by the Codacy finding.

### Changes Made

1. **`.npmrc`** - Removed `block-exotic-subdeps=false` (security risk that disabled pnpm's protection against supply chain attacks)

2. **`pnpm-workspace.yaml`** -
   - Removed the git URL override: `braces: github:micromatch/braces#28d440b5dd449dbf1fe6f3506cf94ecca4d02660`
   - Added `patchedDependencies` entry pointing to local patch file

3. **`patches/braces@3.0.3.patch`** - Created patch that adds depth guards to prevent stack-exhaustion DoS (GHSA-vfj7-8cjw-p6xm / CVE-2026-93687):
   - Added `MAX_DEPTH: 100` constant
   - Added depth checking in `compile.js`, `expand.js`, `parse.js`, and `stringify.js`
   - Added `maxDepth` option for customizable limits
   - Added cycle detection in AST parent chain traversal

4. **`docs/PNPM_OVERRIDES.md`** - Added entry OVR-019 documenting the patch with removal conditions

5. **`test/unit/braces-patch.test.ts`** - Added 8 tests verifying:
   - Deeply nested patterns throw `SyntaxError`/`RangeError` when exceeding `MAX_DEPTH`
   - Patterns within depth limit work correctly
   - Custom `maxDepth` option is respected
   - Both `expand` and `parse` throw on deeply nested input

### Verification

- All 166 unit tests pass ✅
- Lint passes ✅
- Typecheck passes ✅
- Patch effectively mitigates the stack-exhaustion DoS vulnerability locally without requiring `block-exotic-subdeps=false`

The vulnerability GHSA-vfj7-8cjw-p6xm (CVE-2026-93687) remains in `pnpm-workspace.yaml` auditConfig.ignoreGhsas since the upstream `braces@3.0.3` is still vulnerable; the local patch addresses it at runtime.
