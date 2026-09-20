# AGExplorer

A terminal explorer for AI coding sessions — built with [OpenTUI](https://opentui.com) and backed by [Cursor](https://cursor.com) agent transcripts.

Understand how a session unfolded (reads, edits, commands, errors) without rereading the full conversation. Runs entirely on your machine; it only reads local Cursor transcript and plan files — nothing is uploaded or sent over the network.

![AGExplorer demo](docs/assets/demo.gif)

> **Note:** Add `docs/assets/demo.gif` after recording a terminal walkthrough (workspaces → chat → copy). See [CONTRIBUTING.md](CONTRIBUTING.md).

## Features

- **Session Explorer** — typed timeline shows execution path: USER, PLAN, READ, EDIT, RUN, ERROR, AGENT, …
- **Session summary** — deterministic stats (files read/edited, commands run, failures, tool calls)
- **Category filters** — narrow timeline to messages, files, commands, errors, tools, or plans
- **Error navigation** — `Ctrl+]` cycles through errors in the current view
- Event details shown on selection (diffs, commands, reads); Enter focuses the detail pane
- Structured SQLite index stores agent execution events, not just chat messages
- Local SQLite index for fast startup (syncs only changed files)
- Cross-session full-text search across prompts, responses, commands, tool inputs, and turn status
- Global search with `/` in the TUI; CLI `search` with project/session/role/event/date filters
- Export sessions as markdown or JSON (includes summary stats)
- Show linked Cursor Plan files (`*.plan.md`) when present
- Copy a session timeline or event detail to the clipboard

## Requirements

**Bun is required.** The TUI depends on `@opentui/core`, which ships Tree-sitter assets (`.scm`) that only Bun's loader resolves. Plain Node.js will fail with `ERR_UNKNOWN_FILE_EXTENSION`.

- [Bun](https://bun.sh) ≥ 1.3
- [pnpm](https://pnpm.io) (for development from source)

## Install

### Run without cloning (recommended)

```bash
bunx ag-explorer
```

Or install globally:

```bash
bun add -g ag-explorer
ag-explorer
```

### From source

```bash
git clone https://github.com/sureshunnikrishnan/AGExplorer.git
cd AGExplorer
pnpm install
cp .env.example .env
pnpm start
```

Edit `.env` only if your Cursor paths differ from the defaults. Keep `.env` local — it is gitignored and must not be committed.

## Configuration

Values are loaded from `.env` in the project root (existing shell environment variables win).

| Variable | Description |
| --- | --- |
| `CURSOR_CHAT_HISTORY_DIR` | Cursor projects root (dirs with `agent-transcripts/`) |
| `CURSOR_PLANS_DIR` | Cursor plans folder (`*.plan.md`); defaults to `$HOME/.cursor/plans` |
| `AG_EXPLORER_DB_PATH` | Local SQLite index path; defaults to `$HOME/.ag-explorer/index.sqlite` |

`~`, `$HOME`, and `${HOME}` in values are expanded.

If `CURSOR_CHAT_HISTORY_DIR` is unset, AGExplorer falls back to:

1. Parent of `AGENT_TRANSCRIPTS` (two levels up), when that env var is set
2. Otherwise `$HOME/.cursor/projects`

See [`.env.example`](.env.example) for a portable template (no machine-specific paths).

## Data layout

AGExplorer reads Cursor's local on-disk layout:

```
~/.cursor/projects/
  <workspace-slug>/
    agent-transcripts/
      <chat-uuid>/
        <chat-uuid>.jsonl

~/.cursor/plans/
  <slug>_<hash>.plan.md
```

Workspace slugs often look like `Users-<username>-workspace-<path-segments>`. AGExplorer shortens these for display (e.g. `projects-ag-explorer`).

Only top-level chat JSONL files are listed (`<uuid>/<uuid>.jsonl`). Subagent transcripts under `subagents/` are not shown.

## Local index

AGExplorer maintains a derived SQLite index under `AG_EXPLORER_DB_PATH`. Cursor transcript files remain the source of truth.

On startup, AGExplorer syncs only new or changed sessions, then reads projects, sessions, and messages from SQLite. Deleting the index file and restarting recreates the same history from source files.

```bash
ag-explorer index     # sync index without opening the TUI
ag-explorer reindex   # wipe and rebuild the index from source files
ag-explorer search "JWT" --project backend
ag-explorer export "Implement JWT auth" --format markdown
ag-explorer export 42 --format json -o session.json
```

After upgrading, run `ag-explorer reindex` once so structured event kinds, tool commands, paths, and errors are indexed correctly (older rows used coarse message/tool_call kinds).

### Upgrading from a previous install

On first run after the rename, AGExplorer automatically:

- Moves a default index from `~/.chviewer` to `~/.ag-explorer` (when the new path is absent)
- Moves a legacy custom `CHVIEWER_DB_PATH` index onto the new default location
- Rewrites project `.env` keys from `CHVIEWER_DB_PATH` to `AG_EXPLORER_DB_PATH`

Post-upgrade custom `AG_EXPLORER_DB_PATH` locations are left unchanged.

## Clipboard

Copy (`y` / `Ctrl+Y`) tries platform clipboard tools in order:

| Platform | Backend |
| --- | --- |
| macOS | `pbcopy` |
| Windows | `clip` |
| Linux (Wayland) | `wl-copy` |
| Linux (X11) | `xclip -selection clipboard` |
| Fallback | OSC 52 terminal escape sequence |

If copy fails silently, your terminal may not support OSC 52 or the platform tool may be missing from `PATH`.

## Run

```bash
pnpm start
```

Or directly:

```bash
bun src/cli.ts
bun bin/ag-explorer.ts
ag-explorer index
```

## Controls

- `↑` / `↓` — move through projects, sessions, timeline events, or search results
- `0`–`6` — category filter: all, messages, files, commands, errors, tools, plans (when not typing in filter/search)
- `Ctrl+]` — jump to the next error in the filtered timeline (expands detail; wraps)
- `/` — open cross-session search
- `Ctrl+[` — show/hide the projects pane (hidden pane is skipped in Tab focus)
- `Tab` / `Shift+Tab` — switch focus (projects → sessions → filter → timeline → detail; or search input → results). Tabbing away from projects (or Enter on a project) hides the projects pane and focuses sessions; the active project name stays in the Sessions title
- `Enter` — expand/collapse timeline detail; confirm project and hide projects pane; run search; open a search hit and jump to the matching event
- `Esc` — leave search mode
- `y` or `Ctrl+Y` — copy the selected event detail, or the full session timeline when detail is collapsed
- Type in the timeline filter to narrow events within the loaded session (combines with category filter)
- `Ctrl+C` — quit

The **Session Timeline** shows how a session unfolded (USER, PLAN, READ, SEARCH, EDIT, RUN, AGENT, ERROR, UNK). A summary strip above the list shows session-wide counts. RUN events show the command only — Cursor JSONL does not store stdout/stderr or exit codes unless Cursor adds them later. When an exit code is known, successful commands show `✓` in the timeline.

Search matches prompts, assistant text, shell commands, file paths, grep patterns, errors, and turn status. Tool stdout and `tool_result` parts are not in Cursor transcripts today, so they are not indexed unless present in source files.

After upgrading to structured sessions, run `ag-explorer reindex` once so existing sessions pick up the new event kinds.

## Privacy

AGExplorer reads files under your Cursor data directories (chat transcripts and plans). Do not commit `.env`, transcript dumps, or any paths that identify your machine or user account.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Bug reports and feature requests: [GitHub Issues](https://github.com/sureshunnikrishnan/AGExplorer/issues).

## License

[MIT](LICENSE)
