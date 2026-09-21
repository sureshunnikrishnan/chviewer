import { describe, expect, test } from "bun:test"
import type { CommandEvent, ErrorEvent, FileEditEvent, UnknownEvent } from "../../src/core/agent-session"
import {
  formatEventDetailPlain,
  formatFileEditUnifiedDiff,
} from "../../src/ui/event-detail"

describe("formatFileEditUnifiedDiff", () => {
  test("renders StrReplace as unified diff", () => {
    const event: FileEditEvent = {
      id: 1,
      seq: 0,
      type: "file_edit",
      label: "EDIT",
      summary: "history.ts",
      path: "/tmp/fixture/src/history.ts",
      editKind: "StrReplace",
      oldText: "const messages = parse(raw)",
      newText: "const messages = parseTranscript(raw)",
    }

    const diff = formatFileEditUnifiedDiff(event)
    expect(diff).toContain("--- a/tmp/fixture/src/history.ts")
    expect(diff).toContain("+++ b/tmp/fixture/src/history.ts")
    expect(diff).toContain("@@")
    expect(diff).toContain("-const messages = parse(raw)")
    expect(diff).toContain("+const messages = parseTranscript(raw)")
  })

  test("renders Write as all-additions diff", () => {
    const event: FileEditEvent = {
      id: 1,
      seq: 0,
      type: "file_edit",
      label: "EDIT",
      summary: "new.ts",
      path: "/tmp/fixture/src/new.ts",
      editKind: "Write",
      contents: "export const x = 1\nexport const y = 2",
    }

    const diff = formatFileEditUnifiedDiff(event)
    expect(diff).toContain("--- /dev/null")
    expect(diff).toContain("+export const x = 1")
    expect(diff).toContain("+export const y = 2")
  })

  test("returns null for delete and empty bodies", () => {
    const deleted: FileEditEvent = {
      id: 1,
      seq: 0,
      type: "file_edit",
      label: "EDIT",
      summary: "legacy.ts",
      path: "/tmp/fixture/src/legacy.ts",
      editKind: "Delete",
    }

    const emptyWrite: FileEditEvent = {
      id: 2,
      seq: 1,
      type: "file_edit",
      label: "EDIT",
      summary: "empty.ts",
      path: "/tmp/fixture/src/empty.ts",
      editKind: "Write",
      contents: "",
    }

    expect(formatFileEditUnifiedDiff(deleted)).toBeNull()
    expect(formatFileEditUnifiedDiff(emptyWrite)).toBeNull()
  })
})

describe("formatEventDetailPlain", () => {
  test("renders StrReplace diff lines", () => {
    const event: FileEditEvent = {
      id: 1,
      seq: 0,
      type: "file_edit",
      label: "EDIT",
      summary: "history.ts",
      path: "/tmp/fixture/src/history.ts",
      editKind: "StrReplace",
      oldText: "const messages = parse(raw)",
      newText: "const messages = parseTranscript(raw)",
    }

    const detail = formatEventDetailPlain(event)
    expect(detail).toContain("-const messages = parse(raw)")
    expect(detail).toContain("+const messages = parseTranscript(raw)")
    expect(detail).toContain("@@")
  })

  test("renders delete edits without diff", () => {
    const event: FileEditEvent = {
      id: 1,
      seq: 0,
      type: "file_edit",
      label: "EDIT",
      summary: "legacy.ts",
      path: "/tmp/fixture/src/legacy.ts",
      editKind: "Delete",
    }

    const detail = formatEventDetailPlain(event)
    expect(detail).toContain("Kind: Delete")
    expect(detail).not.toContain("@@")
    expect(detail).not.toContain("Edit contents not recorded")
  })

  test("shows notice when edit body is missing", () => {
    const event: FileEditEvent = {
      id: 1,
      seq: 0,
      type: "file_edit",
      label: "EDIT",
      summary: "empty.ts",
      path: "/tmp/fixture/src/empty.ts",
      editKind: "Write",
      contents: "",
    }

    const detail = formatEventDetailPlain(event)
    expect(detail).toContain("Edit contents not recorded in transcript.")
  })

  test("renders command without fake output", () => {
    const event: CommandEvent = {
      id: 2,
      seq: 1,
      type: "command",
      label: "RUN",
      summary: "pnpm test",
      command: "pnpm test",
      workingDirectory: "/tmp/fixture",
    }

    const detail = formatEventDetailPlain(event)
    expect(detail).toContain("Command")
    expect(detail).toContain("pnpm test")
    expect(detail).toContain("Working directory: /tmp/fixture")
    expect(detail).toContain("Output and exit code are not recorded in this session's transcript.")
    expect(detail).not.toContain("PASS")
  })

  test("renders command exit code when present", () => {
    const event: CommandEvent = {
      id: 5,
      seq: 4,
      type: "command",
      label: "RUN",
      summary: "pnpm test",
      command: "pnpm test",
      exitCode: 1,
    }

    const detail = formatEventDetailPlain(event)
    expect(detail).toContain("Command")
    expect(detail).toContain("Exit code: 1")
    expect(detail).not.toContain("Output and exit code are not recorded")
  })

  test("renders error and unknown payloads", () => {
    const error: ErrorEvent = {
      id: 3,
      seq: 2,
      type: "error",
      label: "ERROR",
      summary: "User aborted request",
      status: "error",
      message: "User aborted request",
    }

    const unknown: UnknownEvent = {
      id: 4,
      seq: 3,
      type: "unknown",
      label: "UNK",
      summary: "future_event",
      original: { type: "future_event", foo: 1 },
    }

    expect(formatEventDetailPlain(error)).toContain("User aborted request")
    expect(formatEventDetailPlain(unknown)).toContain('"type": "future_event"')
  })
})
