# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **Session Explorer (v0.5)** — reposition as a terminal explorer for AI coding sessions
- Session summary strip with deterministic stats (files read/edited, commands run, failures, tool calls)
- Category timeline filters: messages, files, commands, errors, tools, plans (`0`–`6`)
- Error navigation: `Ctrl+]` cycles errors in the filtered view with auto-expanded detail
- Soft-collapse projects pane: Tab/Enter after selecting a project hides it (Sessions title shows the active project); `Ctrl+[` toggles it back
- Structured agent session events in the SQLite index (`user_prompt`, `file_read`, `file_edit`, `command`, `search`, `plan`, `error`, `unknown`, …)
- Forward-compatible `unknown` events that preserve unrecognized JSONL lines
- ERROR and UNK timeline labels for failed turns and unrecognized events
- Richer event metadata at index time (plan overview/todos, shell working directory, delete edits, grep filters)

### Changed

- **Renamed to AGExplorer** — npm package and CLI are now `ag-explorer`; default index path is `~/.ag-explorer/index.sqlite` (`AG_EXPLORER_DB_PATH`)
- On first run after upgrade, legacy default and custom `CHVIEWER_DB_PATH` indexes move to `~/.ag-explorer`; project `.env` keys are rewritten automatically
- Product positioning: terminal explorer for AI coding sessions (not just chat history viewer)
- Command detail view uses a structured header; known successful commands show `✓` in the timeline
- Session export includes summary stats at the top
- Cursor parser classifies tool invocations into structured kinds at write time instead of coarse `message` / `tool_call` rows
- Search `event:` filters map directly to structured event kinds

## [1.0.0] - 2026-09-18

### Added

- Terminal UI for browsing Cursor agent chat history across workspaces
- Workspace and chat listing with recency sorting
- Transcript filter and copy-to-clipboard support
- Linked Cursor Plan file path display (`*.plan.md`)
- Environment-based configuration via `.env`
- `ag-explorer` CLI installable via `bunx` / `bun add -g`
- Anonymized transcript fixtures and Bun test suite
- GitHub Actions CI and release workflow
- Contributor docs, issue templates, and changelog

[Unreleased]: https://github.com/sureshunnikrishnan/AGExplorer/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/sureshunnikrishnan/AGExplorer/releases/tag/v1.0.0
