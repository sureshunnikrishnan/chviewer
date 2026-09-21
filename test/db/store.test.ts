import { afterEach, describe, expect, test } from "bun:test"
import { index } from "../../src/core/index"
import { getAgentSession, getSessionFiles, listProjects, listSessions } from "../../src/db/store"
import { getDatabase } from "../../src/core/index"
import {
  FIXTURE_CLAUDE_PROJECTS,
  createTempDbPath,
  sessionPath,
  setupTestEnv,
  teardownTestEnv,
} from "../helpers"
import { timelineEvents } from "../../src/core/agent-session"

const savedEnv = { ...process.env }
const tempDbs: string[] = []

afterEach(() => {
  process.env = { ...savedEnv }
  for (const db of tempDbs.splice(0)) teardownTestEnv(db)
})

describe("getAgentSession", () => {
  test("returns typed timeline events for tool-rich fixture", async () => {
    const dbPath = createTempDbPath()
    tempDbs.push(dbPath)
    setupTestEnv({ dbPath })
    await index()

    const db = getDatabase()
    const project = listProjects(db)[0]!
    const sessions = listSessions(db, project.id)
    const toolSession = sessions.find((session) => session.title === "Fix search bug")
    expect(toolSession).toBeDefined()

    const agentSession = await getAgentSession(db, toolSession!.id)
    expect(agentSession).not.toBeNull()
    expect(agentSession!.source).toBe("cursor")
    expect(project.provider).toBe("cursor")
    expect(agentSession!.project.name).toBe("projects-demo")

    const labels = timelineEvents(agentSession!).map((event) => event.label)

    expect(labels).toEqual([
      "USER",
      "PLAN",
      "READ",
      "SEARCH",
      "EDIT",
      "EDIT",
      "RUN",
      "AGENT",
      "ERROR",
      "UNK",
    ])
    expect(agentSession!.plan?.paths.some((path) => path.includes("demo_plan_abcd1234.plan.md"))).toBe(
      true,
    )
    expect(agentSession!.files.length).toBeGreaterThan(0)
    expect(getSessionFiles(db, toolSession!.id)).toEqual(agentSession!.files)
    void sessionPath
  })

  test("listProjects filters by provider", async () => {
    const dbPath = createTempDbPath()
    tempDbs.push(dbPath)
    setupTestEnv({ dbPath, claudeProjectsDir: FIXTURE_CLAUDE_PROJECTS })
    await index()

    const db = getDatabase()
    const cursorProjects = listProjects(db, "cursor")
    const claudeProjects = listProjects(db, "claude-code")

    expect(cursorProjects.every((project) => project.provider === "cursor")).toBe(true)
    expect(claudeProjects.every((project) => project.provider === "claude-code")).toBe(true)
    expect(cursorProjects.length).toBeGreaterThan(0)
    expect(claudeProjects.length).toBeGreaterThan(0)
  })

  test("returns claude-code sessions without plan metadata", async () => {
    const dbPath = createTempDbPath()
    tempDbs.push(dbPath)
    setupTestEnv({ dbPath, claudeProjectsDir: FIXTURE_CLAUDE_PROJECTS })
    await index()

    const db = getDatabase()
    const claudeProject = db
      .query("SELECT id FROM projects WHERE provider = 'claude-code'")
      .get() as { id: number }
    const sessions = listSessions(db, claudeProject.id)
    const loginSession = sessions.find((session) => session.title === "Fix the login bug")
    expect(loginSession).toBeDefined()
    expect(loginSession!.sourceProvider).toBe("claude-code")

    const agentSession = await getAgentSession(db, loginSession!.id)
    expect(agentSession).not.toBeNull()
    expect(agentSession!.source).toBe("claude-code")
    expect(agentSession!.plan).toBeUndefined()
    expect(timelineEvents(agentSession!).map((event) => event.label)).toEqual([
      "USER",
      "AGENT",
      "READ",
      "TOOL",
      "RUN",
    ])
  })
})
