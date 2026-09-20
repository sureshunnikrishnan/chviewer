import { describe, expect, test } from "bun:test"
import { searchableText } from "../../src/core/search-text"
import type { NormalizedEvent } from "../../src/core/types"

describe("searchableText", () => {
  test("keeps user prompt text unchanged", () => {
    const event: NormalizedEvent = {
      kind: "user_prompt",
      role: "user",
      text: "How do I run the demo app?",
      payload: { provider: "cursor" },
      source_offset: 0,
      timestamp: null,
    }

    expect(searchableText(event)).toBe("How do I run the demo app?")
  })

  test("indexes shell commands from command kind", () => {
    const event: NormalizedEvent = {
      kind: "command",
      role: "assistant",
      text: "",
      payload: {
        provider: "cursor",
        tool: "Shell",
        command: "pnpm test",
        input: { command: "pnpm test", description: "Run tests" },
      },
      source_offset: 0,
      timestamp: null,
    }

    const text = searchableText(event)
    expect(text).toContain("Shell")
    expect(text).toContain("pnpm test")
    expect(text).toContain("Run tests")
  })

  test("indexes read paths and grep patterns from structured kinds", () => {
    const readEvent: NormalizedEvent = {
      kind: "file_read",
      role: "assistant",
      text: "",
      payload: {
        provider: "cursor",
        tool: "Read",
        path: "/tmp/fixture/src/search.ts",
        input: { path: "/tmp/fixture/src/search.ts" },
      },
      source_offset: 0,
      timestamp: null,
    }

    const grepEvent: NormalizedEvent = {
      kind: "search",
      role: "assistant",
      text: "",
      payload: {
        provider: "cursor",
        tool: "Grep",
        searchKind: "grep",
        pattern: "loadHistory",
        path: "/tmp/fixture/src",
        input: { pattern: "loadHistory", path: "/tmp/fixture/src" },
      },
      source_offset: 1,
      timestamp: null,
    }

    expect(searchableText(readEvent)).toContain("/tmp/fixture/src/search.ts")
    expect(searchableText(grepEvent)).toContain("loadHistory")
  })

  test("indexes turn status text", () => {
    const event: NormalizedEvent = {
      kind: "turn_ended",
      role: "turn_ended",
      text: "",
      payload: { provider: "cursor", status: "completed" },
      source_offset: 0,
      timestamp: null,
    }

    expect(searchableText(event)).toContain("completed")
  })

  test("indexes error and unknown payloads", () => {
    const errorEvent: NormalizedEvent = {
      kind: "error",
      role: null,
      text: "",
      payload: {
        provider: "cursor",
        status: "error",
        message: "User aborted request",
      },
      source_offset: 0,
      timestamp: null,
    }

    const unknownEvent: NormalizedEvent = {
      kind: "unknown",
      role: null,
      text: "",
      payload: {
        provider: "cursor",
        original: { type: "future_event", foo: "bar" },
      },
      source_offset: 1,
      timestamp: null,
    }

    expect(searchableText(errorEvent)).toContain("User aborted request")
    expect(searchableText(unknownEvent)).toContain("future_event")
    expect(searchableText(unknownEvent)).toContain("bar")
  })
})
