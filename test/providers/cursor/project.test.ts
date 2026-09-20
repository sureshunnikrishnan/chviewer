import { describe, expect, test } from "bun:test"
import type { StoredEvent } from "../../../src/core/types"
import { isTimelineVisible } from "../../../src/core/agent-session"
import { projectCursorEvents } from "../../../src/providers/cursor/project"

function stored(partial: Partial<StoredEvent> & Pick<StoredEvent, "kind">): StoredEvent {
  return {
    id: partial.id ?? 1,
    seq: partial.seq ?? 0,
    role: partial.role ?? "assistant",
    text: partial.text ?? "",
    payload: partial.payload ?? { provider: "cursor" },
    source_offset: partial.source_offset ?? 0,
    timestamp: partial.timestamp ?? null,
    kind: partial.kind,
  }
}

describe("projectCursorEvents", () => {
  test("maps user prompt to USER event", () => {
    const events = projectCursorEvents([
      stored({
        id: 1,
        kind: "user_prompt",
        role: "user",
        text: "Fix search bug",
      }),
    ])

    expect(events).toHaveLength(1)
    expect(events[0]?.type).toBe("user_prompt")
    expect(events[0]?.label).toBe("USER")
  })

  test("maps structured kinds to typed timeline events", () => {
    const events = projectCursorEvents([
      stored({
        id: 1,
        kind: "file_read",
        payload: {
          provider: "cursor",
          tool: "Read",
          path: "/tmp/fixture/src/search.ts",
          input: { path: "/tmp/fixture/src/search.ts" },
        },
      }),
      stored({
        id: 2,
        kind: "command",
        payload: {
          provider: "cursor",
          tool: "Shell",
          command: "pnpm test",
          input: { command: "pnpm test", description: "Run tests" },
        },
      }),
      stored({
        id: 3,
        kind: "file_edit",
        payload: {
          provider: "cursor",
          tool: "StrReplace",
          path: "/tmp/fixture/src/history.ts",
          editKind: "StrReplace",
          oldText: "const messages = parse(raw)",
          newText: "const messages = parseTranscript(raw)",
          input: {
            path: "/tmp/fixture/src/history.ts",
            old_string: "const messages = parse(raw)",
            new_string: "const messages = parseTranscript(raw)",
          },
        },
      }),
      stored({
        id: 4,
        kind: "search",
        payload: {
          provider: "cursor",
          tool: "Grep",
          searchKind: "grep",
          pattern: "loadHistory",
          path: "/tmp/fixture/src",
          input: { pattern: "loadHistory", path: "/tmp/fixture/src" },
        },
      }),
    ])

    expect(events.map((event) => event.label)).toEqual(["READ", "RUN", "EDIT", "SEARCH"])
    expect(events[2]?.type).toBe("file_edit")
    if (events[2]?.type === "file_edit") {
      expect(events[2].oldText).toContain("parse(raw)")
      expect(events[2].newText).toContain("parseTranscript(raw)")
    }
  })

  test("maps error and unknown events for timeline visibility", () => {
    const events = projectCursorEvents([
      stored({
        id: 1,
        kind: "error",
        payload: {
          provider: "cursor",
          status: "error",
          message: "User aborted request",
        },
      }),
      stored({
        id: 2,
        kind: "unknown",
        payload: {
          provider: "cursor",
          original: { type: "future_event", foo: 1 },
        },
      }),
      stored({
        id: 3,
        kind: "turn_ended",
        payload: { provider: "cursor", status: "success" },
      }),
    ])

    expect(events[0]?.type).toBe("error")
    expect(events[0]?.label).toBe("ERROR")
    expect(events[1]?.type).toBe("unknown")
    expect(events[1]?.label).toBe("UNK")
    expect(isTimelineVisible(events[0]!)).toBe(true)
    expect(isTimelineVisible(events[1]!)).toBe(true)
    expect(isTimelineVisible(events[2]!)).toBe(false)
  })

  test("falls back to input fields for file_edit mapping", () => {
    const events = projectCursorEvents([
      stored({
        id: 1,
        kind: "file_edit",
        payload: {
          provider: "cursor",
          tool: "StrReplace",
          editKind: "StrReplace",
          input: {
            path: "/tmp/fixture/src/history.ts",
            old_string: "const messages = parse(raw)",
            new_string: "const messages = parseTranscript(raw)",
          },
        },
      }),
    ])

    expect(events).toHaveLength(1)
    expect(events[0]?.type).toBe("file_edit")
    if (events[0]?.type === "file_edit") {
      expect(events[0].path).toBe("/tmp/fixture/src/history.ts")
      expect(events[0].oldText).toContain("parse(raw)")
      expect(events[0].newText).toContain("parseTranscript(raw)")
    }
  })
})
