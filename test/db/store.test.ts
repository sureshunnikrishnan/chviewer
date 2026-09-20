import { afterEach, describe, expect, test } from "bun:test"
import { index } from "../../src/core/index"
import { getAgentSession, listProjects, listSessions } from "../../src/db/store"
import { getDatabase } from "../../src/core/index"
import { createTempDbPath, sessionPath, setupTestEnv, teardownTestEnv } from "../helpers"
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
    void sessionPath
  })
})
