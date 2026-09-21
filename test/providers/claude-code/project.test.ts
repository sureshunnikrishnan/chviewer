import { describe, expect, test } from "bun:test"
import { projectClaudeCodeEvents } from "../../../src/providers/claude-code/project"
import type { StoredEvent } from "../../../src/core/types"

describe("projectClaudeCodeEvents", () => {
  test("maps normalized events to timeline labels", () => {
    const events = projectClaudeCodeEvents([
      {
        id: 1,
        seq: 1,
        kind: "user_prompt",
        role: "user",
        text: "Fix bug",
        payload: { provider: "claude-code" },
        source_offset: 0,
        timestamp: null,
      },
      {
        id: 2,
        seq: 2,
        kind: "file_read",
        role: "assistant",
        text: "",
        payload: { provider: "claude-code", path: "src/auth.ts" },
        source_offset: 1,
        timestamp: null,
      },
      {
        id: 3,
        seq: 3,
        kind: "command",
        role: "assistant",
        text: "",
        payload: { provider: "claude-code", command: "pnpm test" },
        source_offset: 2,
        timestamp: null,
      },
    ] as StoredEvent[])

    expect(events.map((event) => event.label)).toEqual(["USER", "READ", "RUN"])
  })
})
