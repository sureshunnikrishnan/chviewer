import { afterEach, describe, expect, test } from "bun:test"
import {
  formatWorkspaceName,
  resolveChatHistoryDir,
  resolvePlansDir,
} from "../../../src/providers/cursor/paths"
import { FIXTURE_PLANS, FIXTURE_PROJECTS } from "../../helpers"

const savedEnv = { ...process.env }

afterEach(() => {
  process.env = { ...savedEnv }
})

describe("formatWorkspaceName", () => {
  test("strips Users-<user>- and workspace- prefixes", () => {
    expect(formatWorkspaceName("Users-fixtureuser-workspace-projects-demo")).toBe(
      "projects-demo",
    )
  })

  test("returns slug when no prefixes match", () => {
    expect(formatWorkspaceName("plain-workspace")).toBe("plain-workspace")
  })
})

describe("resolveChatHistoryDir", () => {
  test("prefers CURSOR_CHAT_HISTORY_DIR", () => {
    process.env.CURSOR_CHAT_HISTORY_DIR = "/tmp/custom-history"
    delete process.env.AGENT_TRANSCRIPTS
    expect(resolveChatHistoryDir()).toBe("/tmp/custom-history")
  })

  test("derives from AGENT_TRANSCRIPTS when history dir unset", () => {
    delete process.env.CURSOR_CHAT_HISTORY_DIR
    process.env.AGENT_TRANSCRIPTS = "/data/projects/ws/agent-transcripts"
    expect(resolveChatHistoryDir()).toBe("/data/projects")
  })
})

describe("resolvePlansDir", () => {
  test("uses CURSOR_PLANS_DIR when set", () => {
    process.env.CURSOR_PLANS_DIR = FIXTURE_PLANS
    expect(resolvePlansDir()).toBe(FIXTURE_PLANS)
  })
})
