import { describe, expect, test } from "bun:test"
import {
  discoverClaudeCodeProjects,
  discoverClaudeCodeSessions,
} from "../../../src/providers/claude-code/discover"
import { FIXTURE_CLAUDE_PROJECTS } from "../../helpers"

describe("claude-code discover", () => {
  test("discovers fixture project and top-level jsonl sessions", async () => {
    const projects = await discoverClaudeCodeProjects(FIXTURE_CLAUDE_PROJECTS)
    expect(projects).toHaveLength(1)
    expect(projects[0]?.name).toBe("projects-demo")

    const sessions = await discoverClaudeCodeSessions(projects[0]!)
    expect(sessions).toHaveLength(2)
    expect(sessions.some((session) => session.titleHint === "Fix the login bug")).toBe(true)
  })

  test("returns empty list when projects directory is missing", async () => {
    const projects = await discoverClaudeCodeProjects("/tmp/ag-explorer-missing-claude-projects")
    expect(projects).toEqual([])
  })
})
