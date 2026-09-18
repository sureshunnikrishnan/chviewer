import { afterEach, beforeAll, describe, expect, test } from "bun:test"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import {
  formatConversationDate,
  formatMessagesPlain,
  formatWorkspaceName,
  loadChatDetails,
  loadChats,
  loadWorkspaces,
  resolveChatHistoryDir,
  resolvePlansDir,
} from "../src/history"

const FIXTURE_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "fixtures")
const FIXTURE_PROJECTS = join(FIXTURE_ROOT, "projects")
const FIXTURE_PLANS = join(FIXTURE_ROOT, "plans")
const CHAT_PATH = join(
  FIXTURE_PROJECTS,
  "Users-fixtureuser-workspace-projects-demo",
  "agent-transcripts",
  "11111111-1111-1111-1111-111111111111",
  "11111111-1111-1111-1111-111111111111.jsonl",
)

const savedEnv = { ...process.env }

beforeAll(() => {
  process.env.CURSOR_CHAT_HISTORY_DIR = FIXTURE_PROJECTS
  process.env.CURSOR_PLANS_DIR = FIXTURE_PLANS
})

afterEach(() => {
  process.env = { ...savedEnv, CURSOR_CHAT_HISTORY_DIR: FIXTURE_PROJECTS, CURSOR_PLANS_DIR: FIXTURE_PLANS }
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

describe("loadWorkspaces", () => {
  test("finds fixture workspace with chats", async () => {
    const workspaces = await loadWorkspaces(FIXTURE_PROJECTS)
    expect(workspaces).toHaveLength(1)
    expect(workspaces[0]?.slug).toBe("Users-fixtureuser-workspace-projects-demo")
    expect(workspaces[0]?.name).toBe("projects-demo")
    expect(workspaces[0]?.chatCount).toBe(1)
  })

  test("throws when directory is unreadable", async () => {
    await expect(loadWorkspaces("/nonexistent/chviewer-fixture-path")).rejects.toThrow(
      "Cannot read chat history directory",
    )
  })
})

describe("loadChats", () => {
  test("extracts title from first user_query", async () => {
    const workspaces = await loadWorkspaces(FIXTURE_PROJECTS)
    const workspace = workspaces[0]
    expect(workspace).toBeDefined()

    const chats = await loadChats(workspace!)
    expect(chats).toHaveLength(1)
    expect(chats[0]?.title).toBe("How do I run the demo app?")
    expect(chats[0]?.path).toBe(CHAT_PATH)
  })
})

describe("loadChatDetails", () => {
  test("parses messages, skips turn_ended, resolves plan refs", async () => {
    const details = await loadChatDetails(CHAT_PATH)

    expect(details.messages.map((m) => m.role)).toEqual(["user", "assistant", "user", "assistant"])
    expect(details.messages[0]?.text).toBe("How do I run the demo app?")
    expect(details.messages[2]?.text).toBe("Follow up without user_query tags")

    expect(details.planPaths).toContain(join(FIXTURE_PLANS, "demo_plan_abcd1234.plan.md"))
    expect(details.planPaths.some((p) => p.includes("demo_plan_abcd1234.plan.md"))).toBe(true)
  })
})

describe("formatConversationDate", () => {
  test("returns unknown for zero timestamp", () => {
    expect(formatConversationDate(0)).toBe("unknown")
  })

  test("formats a valid timestamp", () => {
    const formatted = formatConversationDate(Date.UTC(2026, 0, 15, 12, 30))
    expect(formatted).toContain("2026")
  })
})

describe("formatMessagesPlain", () => {
  test("includes plan paths and role labels", () => {
    const plain = formatMessagesPlain(
      [
        { role: "user", text: "Hello" },
        { role: "assistant", text: "Hi there" },
      ],
      "Demo chat",
      [join(FIXTURE_PLANS, "demo_plan_abcd1234.plan.md")],
    )

    expect(plain).toContain("# Demo chat")
    expect(plain).toContain("## Plan")
    expect(plain).toContain("demo_plan_abcd1234.plan.md")
    expect(plain).toContain("[you]")
    expect(plain).toContain("[agent]")
  })
})
