import { describe, expect, test } from "bun:test"
import type { AgentEvent } from "../../src/core/agent-session"
import { formatSessionSummaryLine, sessionSummary } from "../../src/core/session-summary"

const events: AgentEvent[] = [
  {
    id: 1,
    seq: 0,
    type: "user_prompt",
    label: "USER",
    summary: "Fix auth",
    text: "Fix auth",
  },
  {
    id: 2,
    seq: 1,
    type: "file_read",
    label: "READ",
    summary: "src/auth.ts",
    path: "/tmp/src/auth.ts",
  },
  {
    id: 3,
    seq: 2,
    type: "file_read",
    label: "READ",
    summary: "src/token.ts",
    path: "/tmp/src/token.ts",
  },
  {
    id: 4,
    seq: 3,
    type: "file_edit",
    label: "EDIT",
    summary: "src/token.ts",
    path: "/tmp/src/token.ts",
    editKind: "StrReplace",
  },
  {
    id: 5,
    seq: 4,
    type: "command",
    label: "RUN",
    summary: "pnpm test",
    command: "pnpm test",
    exitCode: 1,
  },
  {
    id: 6,
    seq: 5,
    type: "command",
    label: "RUN",
    summary: "pnpm test",
    command: "pnpm test",
    exitCode: 0,
  },
  {
    id: 7,
    seq: 6,
    type: "command",
    label: "RUN",
    summary: "pnpm lint",
    command: "pnpm lint",
  },
  {
    id: 8,
    seq: 7,
    type: "search",
    label: "SEARCH",
    summary: "refreshToken",
    searchKind: "grep",
    pattern: "refreshToken",
  },
  {
    id: 9,
    seq: 8,
    type: "tool_call",
    label: "TOOL",
    summary: "Task",
    tool: "Task",
    input: {},
  },
  {
    id: 10,
    seq: 9,
    type: "turn_ended",
    label: "TOOL",
    summary: "completed",
    status: "completed",
  },
]

describe("sessionSummary", () => {
  test("counts structured event kinds", () => {
    const summary = sessionSummary(events)
    expect(summary).toEqual({
      filesRead: 2,
      filesEdited: 1,
      commandsRun: 3,
      failedCommands: 1,
      toolCalls: 2,
    })
  })

  test("formatSessionSummaryLine renders stable metrics", () => {
    const line = formatSessionSummaryLine(sessionSummary(events))
    expect(line).toBe("Read 2 · Edited 1 · Run 3 · Failed 1 · Tools 2")
  })
})
