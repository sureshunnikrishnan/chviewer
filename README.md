# chviewer

A small TypeScript terminal UI built with [OpenTUI](https://opentui.com) for browsing [Cursor](https://cursor.com) agent chat history across workspaces.

Runs entirely on your machine. It only reads local Cursor transcript and plan files — nothing is uploaded or sent over the network.

## Features

- Browse workspaces that have `agent-transcripts/`
- List chats by recency and open full transcripts in the terminal
- Filter transcript text
- Show linked Cursor Plan files (`*.plan.md`) when present
- Copy a chat (and plan path) to the clipboard

## Requirements

- [pnpm](https://pnpm.io) (package manager)
- [Bun](https://bun.sh) ≥ 1.3 (runtime)

## Install

```bash
git clone <repo-url> chviewer
cd chviewer
pnpm install
cp .env.example .env
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

## Run

```bash
pnpm start
```

Or directly:

```bash
bun src/index.ts
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

## License

[ISC](LICENSE)
