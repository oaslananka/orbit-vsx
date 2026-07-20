# Maintainer Roadmap and Issue Workflow

This document defines how Orbit maintainers should keep the backlog actionable after the v0.6 stabilization push.

## Milestone lanes

- `v0.5.x`: release blockers, security fixes, CI stability, packaging hygiene.
- `v0.6.x`: native MCP, Agent Mode, reliability, UX consistency, and test coverage.
- `v1.0.0`: Marketplace readiness, governance, docs, release hardening, and long-term support policy.

## Issue labels

Every issue should carry at least:

- one `priority:*` label
- one `area:*` label
- one `type:*` label
- one `risk:*` label when production behavior can change
- one `size/*` label when the work is implementation-heavy
- one `status:*` label

## Definition of ready

An issue is ready when it states:

- expected user or maintainer outcome
- impacted files or feature area
- acceptance criteria
- verification commands
- migration or compatibility notes when applicable

## Definition of done

An issue is done when:

- code/docs/config changes are merged into `main`
- required CI checks pass
- user-facing behavior is documented when relevant
- tests or contract checks cover the behavior where practical
- the issue closes through PR linkage or is manually closed with a summary

## PR expectations

PRs should be small enough to review in one pass. Large epics should be split into contract, implementation, docs, and cleanup PRs where possible.

## Compatibility operations

Use `HEADLESS_TESTING.md` for the required pull-request matrix, weekly stable/Insiders lanes, clean Docker runner, and VPS operator procedure.
