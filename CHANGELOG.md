# Changelog

## [0.5.2] - 2026-06-02

### Fixed

- Removed `actions/setup-node` from CI and release workflows to avoid deprecation warnings emitted by the action runtime during release verification.

## [0.5.1] - 2026-06-02

### Fixed

- Renamed the Marketplace display name to avoid the Visual Studio Marketplace display-name collision encountered during the first public release attempt.

## [0.5.0] - 2026-05-30

### Added

- Proactive down/recover notifications when MCP server status changes
- Inline editor decorations showing error frequency from debug history
- CodeQL analysis, dependency review, and Scorecard CI workflows
- Published secrets documentation in README

### Changed

- Version bump from 0.1.1 to 0.5.0 (cumulative)

## [0.4.0] - 2026-05-30

### Added

- Loading state indicators to all tree providers
- Collapse-all button to debug and a2a tree views
- Live item counts in tree view headers
- Accessibility aria labels on all view title actions

## [0.3.0] - 2026-05-30

### Added

- Panel visibility toggles for info, sessions, tasks, MCP explorer
- Command palette shortcuts for all panel commands
- Rich hover previews (resolveTreeItem) for all tree item types
- Error state tree items when refresh fails on any provider
- Empty state placeholders for health and MCP explorer views
- Baseline tooltips for all tree item classes

### Fixed

- Error handling added to MCP explorer refresh command

## [0.2.0] - 2026-05-30

### Added

- Info, session, and task panel stubs (views + webview apps)
- Sessions refresh command with view/title menu entry
- MCP Explorer panel with tree data provider, refresh, and contextual title
- Inline agent-card.json validation on save and document change
- Unique IDs on all tree items for view state persistence

## [0.1.0] - 2026-05-27

### Added

- Health Monitor panel: tree view of MCP servers with live status polling
- Debug Recorder panel: browse, search, and manage debug sessions
- A2A Explorer panel: agent card validation, registry browser, scaffold command
- Status bar indicator showing aggregate MCP server health
- Configuration schema for all three panels
- OpenVSX and VS Code Marketplace publish workflow
