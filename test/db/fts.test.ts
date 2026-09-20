import { afterEach, describe, expect, test } from "bun:test"
import { index } from "../../src/core/index"
import { getDatabase } from "../../src/core/index"
import { searchEventIds, searchSessions } from "../../src/db/store"
import { createTempDbPath, setupTestEnv, teardownTestEnv } from "../helpers"

const savedEnv = { ...process.env }
const tempDbs: string[] = []

afterEach(() => {
  process.env = { ...savedEnv }
  for (const db of tempDbs.splice(0)) teardownTestEnv(db)
})

describe("events_fts", () => {
  test("finds events by full-text search", async () => {
    const dbPath = createTempDbPath()
    tempDbs.push(dbPath)
    setupTestEnv({ dbPath })

    await index()

    const db = getDatabase()
    const ids = searchEventIds(db, "demo app")
    expect(ids.length).toBeGreaterThan(0)
  })

  test("finds tool commands across sessions", async () => {
    const dbPath = createTempDbPath()
    tempDbs.push(dbPath)
    setupTestEnv({ dbPath })

    await index()

    const db = getDatabase()
    const groups = searchSessions(db, "pnpm test")
    expect(groups.length).toBeGreaterThan(0)
    expect(groups[0]?.hits[0]?.snippet.toLowerCase()).toContain("pnpm")
  })

  test("supports project filter tokens", async () => {
    const dbPath = createTempDbPath()
    tempDbs.push(dbPath)
    setupTestEnv({ dbPath })

    await index()

    const db = getDatabase()
    const groups = searchSessions(db, "demo project:projects-demo")
    expect(groups.every((group) => group.projectName.includes("demo"))).toBe(true)
  })

  test("groups results by session with match counts", async () => {
    const dbPath = createTempDbPath()
    tempDbs.push(dbPath)
    setupTestEnv({ dbPath })

    await index()

    const db = getDatabase()
    const groups = searchSessions(db, "demo")
    expect(groups.length).toBeGreaterThan(0)
    expect(groups[0]?.matchCount).toBeGreaterThan(0)
    expect(groups[0]?.hits.length).toBeGreaterThan(0)
  })

  test("filters by structured event kind", async () => {
    const dbPath = createTempDbPath()
    tempDbs.push(dbPath)
    setupTestEnv({ dbPath })

    await index()

    const db = getDatabase()
    const errorGroups = searchSessions(db, "aborted event:error")
    expect(errorGroups.length).toBeGreaterThan(0)

    const runGroups = searchSessions(db, "pnpm event:run")
    expect(runGroups.length).toBeGreaterThan(0)
  })
})
