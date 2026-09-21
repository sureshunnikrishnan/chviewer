import { afterEach, describe, expect, test } from "bun:test"
import { existsSync, rmSync, unlinkSync } from "node:fs"
import { join } from "node:path"
import { index, rebuild, sync } from "../../src/core/index"
import { getSessionTranscript, listProjects, listSessions } from "../../src/db/store"
import { getDatabase } from "../../src/core/index"
import {
  FIXTURE_CLAUDE_PROJECTS,
  agentSessionSnapshot,
  appendToFile,
  createTempDbPath,
  createTempFixtureRoot,
  sessionPath,
  setupTestEnv,
  teardownTestEnv,
  transcriptSnapshot,
} from "../helpers"

const savedEnv = { ...process.env }
const tempRoots: string[] = []
const tempDbs: string[] = []

afterEach(() => {
  process.env = { ...savedEnv }
  for (const db of tempDbs.splice(0)) teardownTestEnv(db)
  for (const root of tempRoots.splice(0)) {
    if (existsSync(root)) rmSync(root, { recursive: true, force: true })
  }
})

function boot(options?: { fixtureRoot?: string }) {
  const dbPath = createTempDbPath()
  tempDbs.push(dbPath)
  if (options?.fixtureRoot) tempRoots.push(options.fixtureRoot)
  setupTestEnv({ fixtureRoot: options?.fixtureRoot, dbPath })
  return dbPath
}

describe("index sync", () => {
  test("full index loads all fixture sessions", async () => {
    const dbPath = boot()
    const summary = await index()

    expect(summary.sessionsAdded).toBe(6)
    expect(summary.eventsIndexed).toBeGreaterThan(0)

    const db = getDatabase()
    const projects = listProjects(db)
    expect(projects).toHaveLength(1)
    expect(projects[0]?.name).toBe("projects-demo")
    expect(listSessions(db, projects[0]!.id)).toHaveLength(6)
    void dbPath
  })

  test("second sync skips unchanged sessions", async () => {
    const dbPath = boot()
    await index()
    const second = await sync()

    expect(second.sessionsSkipped).toBe(6)
    expect(second.sessionsUpdated).toBe(0)
    expect(second.eventsIndexed).toBe(0)
    void dbPath
  })

  test("modified transcript is reindexed", async () => {
    const fixtureRoot = createTempFixtureRoot()
    tempRoots.push(fixtureRoot)
    const dbPath = boot({ fixtureRoot })

    await index()

    const sessionFile = join(
      fixtureRoot,
      "projects",
      "Users-fixtureuser-workspace-projects-demo",
      "agent-transcripts",
      "22222222-2222-2222-2222-222222222222",
      "22222222-2222-2222-2222-222222222222.jsonl",
    )

    appendToFile(
      sessionFile,
      '{"role":"user","message":{"content":[{"type":"text","text":"<user_query>Updated content</user_query>"}]}}\n',
    )

    const updated = await sync()
    expect(updated.sessionsUpdated).toBe(1)
    expect(updated.sessionsSkipped).toBe(5)

    const db = getDatabase()
    const sessions = listSessions(db, listProjects(db)[0]!.id)
    const normalSession = sessions.find((s) => s.title === "What is a normal session?")
    expect(normalSession).toBeDefined()

    const transcript = await getSessionTranscript(db, normalSession!.id)
    expect(transcript.messages.some((message) => message.text === "Updated content")).toBe(true)
    void dbPath
  })

  test("deleted transcript is pruned", async () => {
    const fixtureRoot = createTempFixtureRoot()
    tempRoots.push(fixtureRoot)
    const dbPath = boot({ fixtureRoot })

    await index()

    const sessionFile = join(
      fixtureRoot,
      "projects",
      "Users-fixtureuser-workspace-projects-demo",
      "agent-transcripts",
      "33333333-3333-3333-3333-333333333333",
      "33333333-3333-3333-3333-333333333333.jsonl",
    )
    unlinkSync(sessionFile)

    const pruned = await sync()
    expect(pruned.sessionsRemoved).toBe(1)

    const db = getDatabase()
    expect(listSessions(db, listProjects(db)[0]!.id)).toHaveLength(5)
    void dbPath
  })

  test("rebuild recreates identical usable history after deleting db", async () => {
    const dbPath = boot()
    await index()
    const before = await transcriptSnapshot(dbPath)
    const agentBefore = await agentSessionSnapshot(dbPath)

    expect(before.length).toBe(6)
    expect(before.some((entry) => entry.sessionTitle === "How do I run the demo app?")).toBe(true)
    expect(
      before.some((entry) =>
        entry.planPaths.some((path) => path.includes("demo_plan_abcd1234.plan.md")),
      ),
    ).toBe(true)

    teardownTestEnv(dbPath)
    tempDbs.pop()

    setupTestEnv({ dbPath })
    await rebuild()
    const after = await transcriptSnapshot(dbPath)

    expect(after).toEqual(before)

    teardownTestEnv(dbPath)
    setupTestEnv({ dbPath })
    await rebuild()
    const agentAfter = await agentSessionSnapshot(dbPath)
    expect(agentAfter).toEqual(agentBefore)
  })

  test("indexes structured event kinds beyond chat messages", async () => {
    const dbPath = boot()
    await index()

    const db = getDatabase()
    const rows = db
      .query("SELECT kind, COUNT(*) AS count FROM events GROUP BY kind ORDER BY kind")
      .all() as Array<{ kind: string; count: number }>

    const kinds = Object.fromEntries(rows.map((row) => [row.kind, row.count]))
    expect(kinds.user_prompt).toBeGreaterThan(0)
    expect(kinds.assistant_message).toBeGreaterThan(0)
    expect(kinds.plan).toBeGreaterThan(0)
    expect(kinds.file_read).toBeGreaterThan(0)
    expect(kinds.file_edit).toBeGreaterThan(0)
    expect(kinds.command).toBeGreaterThan(0)
    expect(kinds.search).toBeGreaterThan(0)
    expect(kinds.error).toBeGreaterThan(0)
    expect(kinds.unknown).toBeGreaterThan(0)
    void dbPath
  })

  test("indexes Claude Code fixture sessions alongside Cursor", async () => {
    const dbPath = boot()
    setupTestEnv({ dbPath, claudeProjectsDir: FIXTURE_CLAUDE_PROJECTS })

    const summary = await index()
    expect(summary.sessionsAdded).toBe(8)

    const db = getDatabase()
    const projects = listProjects(db)
    expect(projects).toHaveLength(2)

    const providerRows = db
      .query(
        `SELECT p.provider, COUNT(s.id) AS session_count
         FROM projects p
         LEFT JOIN sessions s ON s.project_id = p.id
         GROUP BY p.id`,
      )
      .all() as Array<{ provider: string; session_count: number }>

    expect(providerRows.find((row) => row.provider === "claude-code")?.session_count).toBe(2)
    expect(providerRows.find((row) => row.provider === "cursor")?.session_count).toBe(6)
    void dbPath
  })

  test("plan session resolves plan paths from indexed events", async () => {
    const dbPath = boot()
    await index()

    const snapshot = await transcriptSnapshot(dbPath)
    const planSession = snapshot.find((entry) => entry.sessionTitle === "How do I run the demo app?")

    expect(planSession?.planPaths.some((path) => path.includes("demo_plan_abcd1234.plan.md"))).toBe(
      true,
    )
    expect(planSession?.messages.map((m) => m.role)).toEqual([
      "user",
      "assistant",
      "user",
      "assistant",
    ])
    void sessionPath
  })
})
