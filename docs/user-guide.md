# User Guide

AGExplorer is a terminal explorer for AI coding agent sessions. It reads local transcript files from Cursor and Claude Code, builds a searchable index, and lets you browse how a session unfolded — reads, edits, commands, errors — without rereading the full conversation.

Everything runs on your machine. Nothing is uploaded or sent over the network.

## Introduction

### What AGExplorer does

- Builds a typed timeline from agent sessions (USER, PLAN, READ, EDIT, RUN, ERROR, AGENT, …)
- Indexes sessions in local SQLite for fast startup and full-text search
- Shows session summaries, Git context, and derived intelligence
- Lets you bookmark timeline events as durable knowledge
- Exports sessions as markdown or JSON

### Requirements

**Bun is required** (≥ 1.3). The TUI depends on `@opentui/core`, which ships Tree-sitter assets that only Bun's loader resolves. Plain Node.js will fail.

For development from source, you also need [pnpm](https://pnpm.io).

### Privacy

AGExplorer reads files under your local agent data directories (Cursor transcripts/plans, Claude Code transcripts). Do not commit `.env`, transcript dumps, or paths that identify your machine.

---

## Getting started

### Run without cloning

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

Edit `.env` only if your Cursor or Claude Code paths differ from the defaults. Keep `.env` local — it is gitignored.

### First launch

On startup, AGExplorer:

1. Loads configuration from `.env` (existing shell environment variables take precedence)
2. Syncs the SQLite index (imports only new or changed sessions)
3. Opens the TUI with your projects and sessions

The index lives at `AG_EXPLORER_DB_PATH` (default `~/.ag-explorer/index.sqlite`). Deleting it and restarting recreates the same history from source files.

### Configuration

| Variable | Description |
| --- | --- |
| `CURSOR_CHAT_HISTORY_DIR` | Cursor projects root (dirs with `agent-transcripts/`) |
| `CURSOR_PLANS_DIR` | Cursor plans folder (`*.plan.md`); defaults to `$HOME/.cursor/plans` |
| `CLAUDE_PROJECTS_DIR` | Claude Code projects root; defaults to `$HOME/.claude/projects` |
| `CLAUDE_CONFIG_DIR` | Claude Code config root; when set, projects are read from `<dir>/projects` |
| `AG_EXPLORER_DB_PATH` | Local SQLite index path; defaults to `$HOME/.ag-explorer/index.sqlite` |
| `AG_EXPLORER_AUTO_KNOWLEDGE` | When `1`/`true`, auto-save heuristic knowledge candidates on session load (default off) |

If `CURSOR_CHAT_HISTORY_DIR` is unset, AGExplorer falls back to the parent of `AGENT_TRANSCRIPTS` (two levels up) when set, otherwise `$HOME/.cursor/projects`.

See [`.env.example`](../.env.example) for a portable template.

---

## Guides

Task-oriented walkthroughs for common workflows.

### Configure Cursor and Claude Code

**Cursor** stores transcripts under:

```
~/.cursor/projects/
  <workspace-slug>/
    agent-transcripts/
      <chat-uuid>/
        <chat-uuid>.jsonl
```

Set `CURSOR_CHAT_HISTORY_DIR` if your projects root differs. Optionally set `CURSOR_PLANS_DIR` for linked plan files.

**Claude Code** stores transcripts under:

```
~/.claude/projects/
  <encoded-working-directory>/
    <session-id>.jsonl
```

Set `CLAUDE_PROJECTS_DIR` or `CLAUDE_CONFIG_DIR` if needed.

When both providers are configured, the TUI header shows provider chips (e.g. `[Cursor]` Claude Code). Press `Ctrl+P` to cycle the active provider.

Only top-level session JSONL files are indexed. Subagent transcripts under `subagents/` or sidecar directories are not shown.

### Browse a session timeline

1. Launch AGExplorer (`bunx ag-explorer` or `pnpm start`)
2. Select a project in the Projects pane
3. Select a session in the Sessions pane
4. Browse the timeline — events are labeled USER, PLAN, READ, EDIT, RUN, ERROR, AGENT, etc.
5. Press `Enter` on an event to expand its detail (diffs, commands, file contents)
6. Use `↑` / `↓` to move through events

**Category filters** (`0`–`6`) narrow the timeline:

| Key | Filter |
| --- | --- |
| `0` | All events |
| `1` | Messages (user + assistant) |
| `2` | Files (reads + edits) |
| `3` | Commands |
| `4` | Errors |
| `5` | Tools |
| `6` | Plans (Cursor only) |

Type in the timeline filter box to further narrow events within the loaded session.

**Jump to errors:** Press `Ctrl+]` to cycle through error events in the current filtered view.

A summary strip above the timeline shows session-wide counts (files read/edited, commands run, failures, tool calls).

### Search across sessions

**In the TUI:**

1. Press `/` to open cross-session search
2. Type your query and press `Enter`
3. Select a result to jump to the matching event in that session

Search matches prompts, assistant text, shell commands, file paths, grep patterns, errors, and turn status.

**From the CLI:**

```bash
ag-explorer search "JWT"
ag-explorer search "fix auth" --project backend
ag-explorer search "error" --event error --after 2025-01-01
ag-explorer search "deploy" --json
```

Filters: `--project`, `--session`, `--role`, `--event`, `--before`, `--after`, `--json`.

### Export a session

**CLI:**

```bash
ag-explorer export "Implement JWT auth" --format markdown
ag-explorer export 42 --format json -o session.json
ag-explorer export 42 --format json --git
```

- Session reference can be a numeric id or a title substring
- `--format markdown|json` (default: markdown)
- `-o path` writes to a file instead of stdout
- `--git` appends Git context to the export

Exports include session summary stats. JSON exports can include knowledge items and Git context.

### Use Git context and session intelligence

**Git context** shows files touched in the session and nearby Git commits/diffs. Correlation is heuristic — AGExplorer does not claim the session produced a specific commit.

- TUI: `Ctrl+G` while viewing a session
- CLI: `ag-explorer git "Fix search bug"` or `ag-explorer git 42 --json`

**Session intelligence** derives problem description, files, commands, errors, languages, libraries, and an outcome assessment — all deterministic, no LLM.

- TUI: `Ctrl+I` while viewing a session
- CLI: `ag-explorer intelligence "Fix search bug"` or `ag-explorer intelligence 42 --json`

### Bookmark knowledge

Press `k` on a selected timeline event to save it as a durable knowledge item in SQLite. Knowledge survives index rebuilds.

**List knowledge from CLI:**

```bash
ag-explorer knowledge          # all items
ag-explorer knowledge 42       # items for session 42
ag-explorer knowledge 42 --json
```

**Auto-knowledge** (optional): Set `AG_EXPLORER_AUTO_KNOWLEDGE=1` in `.env` to automatically extract heuristic knowledge candidates when a session loads. This uses deterministic rules, not an LLM.

Saved knowledge appears in the intelligence overlay (`Ctrl+I`).

### Rebuild the index after upgrades

After upgrading AGExplorer, run a full reindex once so structured event kinds, tool commands, paths, errors, and session file relationships are indexed correctly:

```bash
ag-explorer reindex
```

For routine use, incremental sync happens automatically on startup:

```bash
ag-explorer index    # sync without opening the TUI
```

**Upgrading from a previous install:** AGExplorer automatically migrates a default index from `~/.chviewer` to `~/.ag-explorer` and rewrites legacy `CHVIEWER_DB_PATH` env keys.

---

## API

AGExplorer has no HTTP or REST API. The programmatic surface is the in-process library used by the CLI and TUI. Power users and integrators can import these modules directly in Bun/TypeScript scripts.

### Key modules

| Import from | Use for |
| --- | --- |
| `src/core/index.ts` | `index()`, `sync()`, `rebuild()`, `getDatabase()` |
| `src/db/store.ts` | `listProjects`, `listSessions`, `getAgentSession`, `searchSessions` |
| `src/core/export.ts` | `formatSessionPlain`, `formatSessionJson` |
| `src/core/session-intelligence.ts` | `sessionIntelligence`, `sessionOutcome` |
| `src/core/git.ts` | `resolveGitSessionContext` |
| `src/providers/registry.ts` | `allProviders`, `getProvider` |
| `src/providers/types.ts` | `SessionProvider` interface |

### Example: load and export a session

```typescript
import { loadEnvFile } from "./src/core/env"
import { index, getDatabase } from "./src/core/index"
import { getAgentSession, resolveSessionId } from "./src/db/store"
import { formatSessionPlain } from "./src/core/export"

loadEnvFile()
await index()

const db = getDatabase()
const sessionId = resolveSessionId(db, "Fix search bug")
if (!sessionId) throw new Error("Session not found")

const session = await getAgentSession(db, sessionId)
if (!session) throw new Error("Session not found")

console.log(formatSessionPlain(session))
```

### Adding a provider

Implement the `SessionProvider` interface in `src/providers/types.ts`, register it in `src/providers/registry.ts`, and add configuration detection in `src/providers/configured.ts`. See [Design & Architecture](design-and-architecture.md) for the full contract.

---

## CLI

Full command reference for `ag-explorer`.

### Usage

```
ag-explorer [index|reindex|search|export|git|intelligence|knowledge|tui]
```

Running `ag-explorer` with no arguments opens the TUI (same as `ag-explorer tui`).

### Commands

#### `index`

Sync the SQLite index without opening the TUI. Prints a summary of projects and sessions added, updated, or removed.

```bash
ag-explorer index
```

#### `reindex`

Wipe the index and rebuild from all source transcript files.

```bash
ag-explorer reindex
```

Run this once after upgrading AGExplorer.

#### `search <query>`

Full-text search across all indexed sessions.

```bash
ag-explorer search <query> [options]
```

| Option | Description |
| --- | --- |
| `--project <name>` | Filter by project name substring |
| `--session <title\|id>` | Filter by session title or id |
| `--role user\|assistant` | Filter by event role |
| `--event <kind>` | Filter by event kind (e.g. `user`, `run`, `error`) |
| `--before <ISO date>` | Events before this date |
| `--after <ISO date>` | Events after this date |
| `--json` | Output JSON instead of human-readable text |

Exit code `1` when no results are found.

#### `export <sessionId|title>`

Export a session as markdown or JSON.

```bash
ag-explorer export <sessionId|title> [options]
```

| Option | Description |
| --- | --- |
| `--format markdown\|json` | Output format (default: markdown) |
| `--git` | Include Git context |
| `-o`, `--output <path>` | Write to file instead of stdout |

#### `git <sessionId|title>`

Show Git context for a session: files touched, nearby commits, diffs.

```bash
ag-explorer git <sessionId|title> [--json]
```

#### `intelligence <sessionId|title>`

Show derived session intelligence: problem, files, commands, errors, languages, outcome.

```bash
ag-explorer intelligence <sessionId|title> [--json]
```

#### `knowledge [sessionId|title]`

List saved knowledge items. Omit the session reference to list all items.

```bash
ag-explorer knowledge [sessionId|title] [--json]
```

---

## UI

The TUI is a full-screen terminal application built with OpenTUI. There is no web interface.

### Layout

```
┌─────────────────────────────────────────────────────────┐
│ [Cursor] Claude Code          Session title             │
├──────────┬──────────┬───────────────────────────────────┤
│ Projects │ Sessions │ Filter │ Timeline        │ Detail │
│          │          │        │ ─────────────── │        │
│          │          │        │ Summary strip   │        │
│          │          │        │ USER  Fix bug…  │        │
│          │          │        │ READ  src/…     │        │
│          │          │        │ RUN   npm test  │        │
└──────────┴──────────┴────────┴─────────────────┴────────┘
```

- **Projects pane** — workspaces for the active provider
- **Sessions pane** — sessions within the selected project
- **Filter** — category filter and inline text filter
- **Timeline** — typed event list with summary strip
- **Detail** — expanded content for the selected event

Press `Ctrl+[` to hide/show the Projects pane. Tabbing away from Projects (or pressing Enter on a project) hides the pane and focuses Sessions.

### Keybindings

| Key | Action |
| --- | --- |
| `↑` / `↓` | Move through projects, sessions, timeline events, or search results |
| `Tab` / `Shift+Tab` | Switch focus between panes |
| `Enter` | Expand/collapse timeline detail; confirm project; run search; jump to search hit |
| `Esc` | Leave search mode |
| `0`–`6` | Category filter (all, messages, files, commands, errors, tools, plans) |
| `/` | Open cross-session search |
| `Ctrl+P` | Cycle active provider (when multiple configured) |
| `Ctrl+G` | Open Git context overlay |
| `Ctrl+I` | Open session intelligence overlay |
| `Ctrl+]` | Jump to next error in filtered timeline |
| `Ctrl+[` | Show/hide Projects pane |
| `Ctrl+Y` | Copy selected event detail or full session timeline |
| `k` | Bookmark selected timeline event as knowledge |
| `Ctrl+C` | Quit |

### Timeline labels

| Label | Meaning |
| --- | --- |
| USER | User prompt |
| AGENT | Assistant message |
| PLAN | Linked plan file |
| READ | File read |
| SEARCH | Search/grep operation |
| EDIT | File edit (detail shows diff when available) |
| RUN | Shell command (shows command only; exit code when known) |
| ERROR | Error event |
| UNK | Unknown/unclassified event |

RUN events show `✓` in the timeline when an exit code is known and the command succeeded.

### Overlays

**Search (`/`)**

- Type a query and press Enter
- Results grouped by project and session
- Select a hit to load that session and jump to the matching event
- Press Esc to return to the default layout

**Git context (`Ctrl+G`)**

- Session files (read/edit relations)
- Nearby Git commits
- Git diffs for correlated files

**Session intelligence (`Ctrl+I`)**

- Session outcome assessment
- Derived problem, files, commands, errors, languages, libraries
- Saved knowledge items for the session

### Clipboard

Copy (`Ctrl+Y`) tries platform clipboard tools in order:

| Platform | Backend |
| --- | --- |
| macOS | `pbcopy` |
| Windows | `clip` |
| Linux (Wayland) | `wl-copy` |
| Linux (X11) | `xclip -selection clipboard` |
| Fallback | OSC 52 terminal escape sequence |

If copy fails silently, your terminal may not support OSC 52 or the platform tool may be missing from `PATH`.

### Provider chips

The header shows configured providers based on `.env` keys. The active provider is bracketed (e.g. `[Cursor]`). Projects and search results filter to the active provider. Press `Ctrl+P` to cycle when more than one provider is configured.

Plans filter (`6`) is hidden for providers that do not support plan files (e.g. Claude Code).
