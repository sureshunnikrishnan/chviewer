import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { parseSessionContent, parseSessionFile } from "../../../src/providers/cursor/parse"
import { sessionPath } from "../../helpers"

function messageKinds(events: ReturnType<typeof parseSessionContent>["events"]): string[] {
  return events
    .filter((event) => event.kind === "user_prompt" || event.kind === "assistant_message")
    .map((event) => event.kind)
}

describe("parseSessionContent", () => {
  test("parses normal session messages", () => {
    const raw = readFileSync(sessionPath("22222222-2222-2222-2222-222222222222"), "utf8")
    const parsed = parseSessionContent(raw, 1000, "22222222")

    expect(parsed.title).toBe("What is a normal session?")
    expect(messageKinds(parsed.events)).toEqual(["user_prompt", "assistant_message"])
    expect(parsed.events[0]?.text).toBe("What is a normal session?")
  })

  test("skips malformed JSONL lines", () => {
    const raw = readFileSync(sessionPath("33333333-3333-3333-3333-333333333333"), "utf8")
    const parsed = parseSessionContent(raw, 1000, "33333333")

    expect(parsed.title).toBe("Malformed lines test")
    expect(messageKinds(parsed.events)).toEqual(["user_prompt", "assistant_message"])
  })

  test("ignores incomplete final line without newline", () => {
    const raw = readFileSync(sessionPath("44444444-4444-4444-4444-444444444444"), "utf8")
    const parsed = parseSessionContent(raw, 1000, "44444444")

    expect(messageKinds(parsed.events)).toEqual(["user_prompt", "assistant_message"])
    expect(parsed.events.some((e) => e.text.includes("partial without closing"))).toBe(false)
  })

  test("indexes plan session structured events", async () => {
    const parsed = await parseSessionFile(sessionPath("11111111-1111-1111-1111-111111111111"))

    expect(parsed.title).toBe("How do I run the demo app?")
    expect(parsed.events.some((e) => e.kind === "plan")).toBe(true)
    expect(parsed.events.some((e) => e.kind === "turn_ended")).toBe(true)
  })

  test("emits one structured event per tool_use on the same line", () => {
    const raw = JSON.stringify({
      role: "assistant",
      message: {
        content: [
          { type: "tool_use", name: "Read", input: { path: "/a.ts" } },
          { type: "tool_use", name: "Shell", input: { command: "pnpm test" } },
        ],
      },
    })

    const parsed = parseSessionContent(`${raw}\n`, 1000, "session")
    expect(parsed.events.map((event) => event.kind)).toEqual(["file_read", "command"])
  })

  test("handles alternate turn_ended shape", () => {
    const raw = '{"type":"turn_ended","status":"success"}\n'
    const parsed = parseSessionContent(raw, 1000, "session")
    expect(parsed.events.some((event) => event.kind === "turn_ended")).toBe(true)
  })

  test("maps error turn_ended to error kind", () => {
    const raw = '{"type":"turn_ended","status":"error","error":"User aborted request"}\n'
    const parsed = parseSessionContent(raw, 1000, "session")

    expect(parsed.events).toHaveLength(1)
    expect(parsed.events[0]?.kind).toBe("error")
    expect(parsed.events[0]?.payload.message).toBe("User aborted request")
  })

  test("preserves unknown parsed lines", () => {
    const raw = '{"type":"future_event","foo":1}\n'
    const parsed = parseSessionContent(raw, 1000, "session")

    expect(parsed.events).toHaveLength(1)
    expect(parsed.events[0]?.kind).toBe("unknown")
    expect(parsed.events[0]?.payload.original).toEqual({ type: "future_event", foo: 1 })
  })

  test("classifies Delete as file_edit", () => {
    const raw = JSON.stringify({
      role: "assistant",
      message: {
        content: [{ type: "tool_use", name: "Delete", input: { path: "/tmp/legacy.ts" } }],
      },
    })

    const parsed = parseSessionContent(`${raw}\n`, 1000, "session")
    expect(parsed.events[0]?.kind).toBe("file_edit")
    expect(parsed.events[0]?.payload.editKind).toBe("delete")
  })

  test("parses large conversation fixture", async () => {
    const parsed = await parseSessionFile(sessionPath("55555555-5555-5555-5555-555555555555"))

    expect(parsed.title).toBe("Large conversation test")
    expect(parsed.events.filter((e) => e.kind === "user_prompt" || e.kind === "assistant_message").length).toBeGreaterThan(100)
  })

  test("parses tool-rich fixture with structured kinds", async () => {
    const parsed = await parseSessionFile(sessionPath("66666666-6666-6666-6666-666666666666"))

    expect(parsed.events.map((event) => event.kind)).toEqual([
      "user_prompt",
      "plan",
      "file_read",
      "search",
      "file_edit",
      "file_edit",
      "command",
      "assistant_message",
      "error",
      "unknown",
    ])
  })
})
