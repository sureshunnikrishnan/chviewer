# chviewer

A small TypeScript terminal UI built with [OpenTUI](https://opentui.com) for browsing [Cursor](https://cursor.com) agent chat history across workspaces.

Runs entirely on your machine. It only reads local Cursor transcript and plan files — nothing is uploaded or sent over the network.

![chviewer demo](docs/assets/demo.gif)

> **Note:** Add `docs/assets/demo.gif` after recording a terminal walkthrough (workspaces → chat → copy). See [CONTRIBUTING.md](CONTRIBUTING.md).

## Features

- Browse workspaces that have `agent-transcripts/`
- List chats by recency and open full transcripts in the terminal
- Filter transcript text
- Show linked Cursor Plan files (`*.plan.md`) when present
- Copy a chat (and plan path) to the clipboard

## Requirements

**Bun is required.** The TUI depends on `@opentui/core`, which ships Tree-sitter assets (`.scm`) that only Bun's loader resolves. Plain Node.js will fail with `ERR_UNKNOWN_FILE_EXTENSION`.

- [Bun](https://bun.sh) ≥ 1.3
- [pnpm](https://pnpm.io) (for development from source)

## Install

### Run without cloning (recommended)

```bash
bunx chviewer
```

Or install globally:

```bash
bun add -g chviewer
chviewer
```

### From source

```bash
git clone https://github.com/sureshunnikrishnan/chviewer.git
cd chviewer
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

`~`, `$HOME`, and `${HOME}` in values are expanded.

If `CURSOR_CHAT_HISTORY_DIR` is unset, chviewer falls back to:

1. Parent of `AGENT_TRANSCRIPTS` (two levels up), when that env var is set
2. Otherwise `$HOME/.cursor/projects`

See [`.env.example`](.env.example) for a portable template (no machine-specific paths).

## Data layout

chviewer reads Cursor's local on-disk layout:

```
~/.cursor/projects/
  <workspace-slug>/
    agent-transcripts/
      <chat-uuid>/
        <chat-uuid>.jsonl

~/.cursor/plans/
  <slug>_<hash>.plan.md
```

Workspace slugs often look like `Users-<username>-workspace-<path-segments>`. chviewer shortens these for display (e.g. `projects-chviewer`).

Only top-level chat JSONL files are listed (`<uuid>/<uuid>.jsonl`). Subagent transcripts under `subagents/` are not shown.

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
bun src/index.ts
bun bin/chviewer.ts
```

## Controls

- `↑` / `↓` — move through workspaces or chats
- `Tab` / `Shift+Tab` — switch focus (workspaces → chats → filter → transcript)
- `y` or `Ctrl+Y` — copy the selected chat (and plan path, if any) to the clipboard
- Type in the filter to narrow transcript text
- `Ctrl+C` — quit

When a chat used Cursor Plan mode, associated `*.plan.md` file paths are shown under **Plan** at the top of the transcript.

## Privacy

chviewer reads files under your Cursor data directories (chat transcripts and plans). Do not commit `.env`, transcript dumps, or any paths that identify your machine or user account.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Bug reports and feature requests: [GitHub Issues](https://github.com/sureshunnikrishnan/chviewer/issues).

## License

[MIT](LICENSE)
