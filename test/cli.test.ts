import { describe, expect, test } from "bun:test"
import { spawnSync } from "node:child_process"
import { join } from "node:path"
import { createTempDbPath, FIXTURE_PLANS, FIXTURE_PROJECTS, teardownTestEnv } from "./helpers"

const ROOT = join(import.meta.dir, "..")

describe("cli", () => {
  test("index command exits zero and prints summary", () => {
    const dbPath = createTempDbPath()
    const result = spawnSync("bun", ["src/cli.ts", "index"], {
      cwd: ROOT,
      env: {
        ...process.env,
        CURSOR_CHAT_HISTORY_DIR: FIXTURE_PROJECTS,
        CURSOR_PLANS_DIR: FIXTURE_PLANS,
        AG_EXPLORER_DB_PATH: dbPath,
      },
      encoding: "utf8",
    })

    expect(result.status).toBe(0)
    expect(result.stdout).toContain("events indexed:")
    teardownTestEnv(dbPath)
  })

  test("reindex command exits zero", () => {
    const dbPath = createTempDbPath()
    const result = spawnSync("bun", ["src/cli.ts", "reindex"], {
      cwd: ROOT,
      env: {
        ...process.env,
        CURSOR_CHAT_HISTORY_DIR: FIXTURE_PROJECTS,
        CURSOR_PLANS_DIR: FIXTURE_PLANS,
        AG_EXPLORER_DB_PATH: dbPath,
      },
      encoding: "utf8",
    })

    expect(result.status).toBe(0)
    expect(result.stdout).toContain("sessions:")
    teardownTestEnv(dbPath)
  })

  test("unknown command exits non-zero", () => {
    const result = spawnSync("bun", ["src/cli.ts", "not-a-command"], {
      cwd: ROOT,
      env: { ...process.env },
      encoding: "utf8",
    })

    expect(result.status).toBe(1)
    expect(result.stderr).toContain("Usage:")
  })

  test("search command finds indexed messages", () => {
    const dbPath = createTempDbPath()
    const result = spawnSync("bun", ["src/cli.ts", "search", "demo app"], {
      cwd: ROOT,
      env: {
        ...process.env,
        CURSOR_CHAT_HISTORY_DIR: FIXTURE_PROJECTS,
        CURSOR_PLANS_DIR: FIXTURE_PLANS,
        AG_EXPLORER_DB_PATH: dbPath,
      },
      encoding: "utf8",
    })

    expect(result.status).toBe(0)
    expect(result.stdout).toContain("match")
    teardownTestEnv(dbPath)
  })

  test("export command writes markdown to stdout", () => {
    const dbPath = createTempDbPath()
    spawnSync("bun", ["src/cli.ts", "index"], {
      cwd: ROOT,
      env: {
        ...process.env,
        CURSOR_CHAT_HISTORY_DIR: FIXTURE_PROJECTS,
        CURSOR_PLANS_DIR: FIXTURE_PLANS,
        AG_EXPLORER_DB_PATH: dbPath,
      },
      encoding: "utf8",
    })

    const result = spawnSync("bun", ["src/cli.ts", "export", "How do I run the demo app?"], {
      cwd: ROOT,
      env: {
        ...process.env,
        CURSOR_CHAT_HISTORY_DIR: FIXTURE_PROJECTS,
        CURSOR_PLANS_DIR: FIXTURE_PLANS,
        AG_EXPLORER_DB_PATH: dbPath,
      },
      encoding: "utf8",
    })

    expect(result.status).toBe(0)
    expect(result.stdout).toContain("# How do I run the demo app?")
    expect(result.stdout).toContain("Session outcome")
    expect(result.stdout).toContain("Session Timeline")
    teardownTestEnv(dbPath)
  })

  test("export command supports json format", () => {
    const dbPath = createTempDbPath()
    spawnSync("bun", ["src/cli.ts", "index"], {
      cwd: ROOT,
      env: {
        ...process.env,
        CURSOR_CHAT_HISTORY_DIR: FIXTURE_PROJECTS,
        CURSOR_PLANS_DIR: FIXTURE_PLANS,
        AG_EXPLORER_DB_PATH: dbPath,
      },
      encoding: "utf8",
    })

    const result = spawnSync("bun", ["src/cli.ts", "export", "1", "--format", "json"], {
      cwd: ROOT,
      env: {
        ...process.env,
        CURSOR_CHAT_HISTORY_DIR: FIXTURE_PROJECTS,
        CURSOR_PLANS_DIR: FIXTURE_PLANS,
        AG_EXPLORER_DB_PATH: dbPath,
      },
      encoding: "utf8",
    })

    expect(result.status).toBe(0)
    expect(result.stdout).toContain('"events"')
    expect(result.stdout).toContain('"files"')
    expect(result.stdout).toContain('"intelligence"')
    expect(result.stdout).toContain('"knowledge"')
    teardownTestEnv(dbPath)
  })

  test("git command prints nearby commit context", () => {
    const dbPath = createTempDbPath()
    spawnSync("bun", ["src/cli.ts", "index"], {
      cwd: ROOT,
      env: {
        ...process.env,
        CURSOR_CHAT_HISTORY_DIR: FIXTURE_PROJECTS,
        CURSOR_PLANS_DIR: FIXTURE_PLANS,
        AG_EXPLORER_DB_PATH: dbPath,
      },
      encoding: "utf8",
    })

    const result = spawnSync("bun", ["src/cli.ts", "git", "Fix search bug"], {
      cwd: ROOT,
      env: {
        ...process.env,
        CURSOR_CHAT_HISTORY_DIR: FIXTURE_PROJECTS,
        CURSOR_PLANS_DIR: FIXTURE_PLANS,
        AG_EXPLORER_DB_PATH: dbPath,
      },
      encoding: "utf8",
    })

    expect(result.status).toBe(0)
    expect(result.stdout).toContain("Git context")
    expect(result.stdout).toContain("Session files")
    teardownTestEnv(dbPath)
  })

  test("intelligence command prints derived session info", () => {
    const dbPath = createTempDbPath()
    spawnSync("bun", ["src/cli.ts", "index"], {
      cwd: ROOT,
      env: {
        ...process.env,
        CURSOR_CHAT_HISTORY_DIR: FIXTURE_PROJECTS,
        CURSOR_PLANS_DIR: FIXTURE_PLANS,
        AG_EXPLORER_DB_PATH: dbPath,
      },
      encoding: "utf8",
    })

    const result = spawnSync("bun", ["src/cli.ts", "intelligence", "How do I run the demo app?"], {
      cwd: ROOT,
      env: {
        ...process.env,
        CURSOR_CHAT_HISTORY_DIR: FIXTURE_PROJECTS,
        CURSOR_PLANS_DIR: FIXTURE_PLANS,
        AG_EXPLORER_DB_PATH: dbPath,
      },
      encoding: "utf8",
    })

    expect(result.status).toBe(0)
    expect(result.stdout).toContain("Session outcome")
    expect(result.stdout).toContain("Problem")
    teardownTestEnv(dbPath)
  })

  test("knowledge command lists saved items", () => {
    const dbPath = createTempDbPath()
    spawnSync("bun", ["src/cli.ts", "index"], {
      cwd: ROOT,
      env: {
        ...process.env,
        CURSOR_CHAT_HISTORY_DIR: FIXTURE_PROJECTS,
        CURSOR_PLANS_DIR: FIXTURE_PLANS,
        AG_EXPLORER_DB_PATH: dbPath,
      },
      encoding: "utf8",
    })

    const empty = spawnSync("bun", ["src/cli.ts", "knowledge"], {
      cwd: ROOT,
      env: {
        ...process.env,
        CURSOR_CHAT_HISTORY_DIR: FIXTURE_PROJECTS,
        CURSOR_PLANS_DIR: FIXTURE_PLANS,
        AG_EXPLORER_DB_PATH: dbPath,
      },
      encoding: "utf8",
    })

    expect(empty.status).toBe(1)
    expect(empty.stdout).toContain("No knowledge items")
    teardownTestEnv(dbPath)
  })
})
