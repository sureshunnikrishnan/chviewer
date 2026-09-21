# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **Session intelligence (v0.8)** — deterministic derived session info (problem, files, commands, errors, languages, libraries) and session outcome
- Persisted `knowledge_items` in SQLite with manual bookmarks (`k`) and optional heuristic auto-extraction (`AG_EXPLORER_AUTO_KNOWLEDGE`)
- TUI intelligence overlay (`Ctrl+I`) with outcome, derived fields, and saved knowledge
- CLI `ag-explorer intelligence <session>` and `ag-explorer knowledge [session]`
- Session export includes intelligence, outcome, and knowledge arrays
- Header provider selector driven by `.env` — shows configured providers with the active one highlighted; `Ctrl+P` cycles when multiple are configured
- **Multi-provider architecture (v0.7)** — Cursor is one pluggable `SessionProvider`; Claude Code is the first additional provider
- `SessionProvider` contract with capability flags (`toolCalls`, `fileChanges`, `commands`, `plans`)
- Provider registry wires sync and session loading without hard-coded Cursor imports in core/store
- Claude Code discovery and JSONL parsing for top-level session files under `~/.claude/projects`
- **Git-aware sessions (v0.6)** — connect sessions to touched files and nearby Git activity
- Persisted `session_files` relationships (read, edited, created, deleted) derived from transcript events
- Live Git context: repository discovery, HEAD before/after session window, changed files, nearby commits
- TUI Git context overlay (`Ctrl+G`) with session files, nearby commits, and Git unified diffs
- CLI `ag-explorer git <session>` and optional `export --git`
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

- `AgentSession.source` is now the provider id (`cursor`, `claude-code`, …) instead of a Cursor-only literal
- Timeline plans filter is hidden for providers without plan support (e.g. Claude Code)
- Command detail copy is provider-neutral when stdout/exit code are absent
- TUI shortcuts: Git context is `Ctrl+G`; copy is `Ctrl+Y` (bare `g` / `y` removed)
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
