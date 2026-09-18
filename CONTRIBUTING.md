# Contributing to chviewer

Thanks for your interest in improving chviewer. This project is a local-only Bun CLI for browsing Cursor agent transcripts.

## Development setup

Requirements:

- [Bun](https://bun.sh) ≥ 1.3
- [pnpm](https://pnpm.io) 12.4.1 (see `packageManager` in `package.json`)

```bash
git clone https://github.com/sureshunnikrishnan/chviewer.git
cd chviewer
pnpm install
cp .env.example .env
```

Run locally:

```bash
pnpm start      # launch the TUI
pnpm dev        # watch mode
pnpm typecheck  # TypeScript check (src + bin)
pnpm test       # Bun test suite
```

## Tests and fixtures

Tests live in [`test/`](test/) and use anonymized fixtures under [`fixtures/`](fixtures/).

**Never commit real Cursor transcripts, `.env` files, or machine-specific paths.** Fixtures must use synthetic usernames, UUIDs, and paths only.

When adding parser or history behavior, extend fixtures to cover:

- user messages with and without `<user_query>` tags
- assistant text turns
- `turn_ended` lines (skipped)
- malformed JSONL lines (skipped gracefully)
- Cursor Plan references (`CreatePlan` tool use and `*.plan.md` paths)

Point tests at fixtures via `CURSOR_CHAT_HISTORY_DIR` and `CURSOR_PLANS_DIR`.

## Pull requests

1. Fork and branch from `master`.
2. Keep changes focused; update tests and docs when behavior changes.
3. Run `pnpm typecheck` and `pnpm test` before opening a PR.
4. Update [`CHANGELOG.md`](CHANGELOG.md) under **Unreleased** for user-visible changes.

## Code style

- TypeScript with strict mode
- Prefer existing patterns in `src/history.ts` and `src/index.ts`
- No network calls — chviewer reads local files only

## Releasing

Maintainers cut releases from `master`:

1. Move **Unreleased** notes in [`CHANGELOG.md`](CHANGELOG.md) into a new version section.
2. Commit, then tag and push: `git tag v1.0.0 && git push origin v1.0.0`
3. The [release workflow](.github/workflows/release.yml) creates the GitHub Release and publishes to npm when `NPM_TOKEN` is configured.

## Questions

Open a [GitHub issue](https://github.com/sureshunnikrishnan/chviewer/issues) for bugs or feature ideas.
