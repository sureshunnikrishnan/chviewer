import { describe, expect, test } from "bun:test"
import type { AgentEvent } from "../../src/core/agent-session"
import {
  formatRelationBadges,
  sessionFilesFromAgentEvents,
  sessionFilesFromNormalizedEvents,
} from "../../src/core/session-files"
import type { NormalizedEvent } from "../../src/core/types"

function normalized(partial: Partial<NormalizedEvent> & Pick<NormalizedEvent, "kind">): NormalizedEvent {
  return {
    kind: partial.kind,
    role: partial.role ?? "assistant",
    text: partial.text ?? "",
    payload: partial.payload ?? { provider: "cursor" },
    source_offset: partial.source_offset ?? 0,
    timestamp: partial.timestamp ?? null,
  }
}

describe("sessionFilesFromNormalizedEvents", () => {
  test("aggregates read, edit, create, and delete relations per path", () => {
    const files = sessionFilesFromNormalizedEvents([
      normalized({
        kind: "file_read",
        payload: { path: "/repo/src/auth.ts" },
      }),
      normalized({
        kind: "file_edit",
        payload: { path: "/repo/src/auth.ts", editKind: "StrReplace" },
      }),
      normalized({
        kind: "file_edit",
        payload: { path: "/repo/src/token.ts", editKind: "Write" },
      }),
      normalized({
        kind: "file_edit",
        payload: { path: "/repo/tests/auth.test.ts", editKind: "Delete" },
      }),
    ])

    expect(files).toHaveLength(3)
    expect(files.find((file) => file.path.endsWith("auth.ts"))?.relations).toEqual([
      "read",
      "edited",
    ])
    expect(files.find((file) => file.path.endsWith("token.ts"))?.relations).toEqual(["created"])
    expect(files.find((file) => file.path.endsWith("auth.test.ts"))?.relations).toEqual(["deleted"])
  })

  test("normalizes lowercase delete editKind", () => {
    const files = sessionFilesFromNormalizedEvents([
      normalized({
        kind: "file_edit",
        payload: { path: "/repo/old.ts", editKind: "delete" },
      }),
    ])

    expect(files[0]?.relations).toEqual(["deleted"])
  })
})

describe("sessionFilesFromAgentEvents", () => {
  test("maps projected agent events", () => {
    const events: AgentEvent[] = [
      {
        id: 1,
        seq: 0,
        label: "READ",
        summary: "src/auth.ts",
        type: "file_read",
        path: "src/auth.ts",
      },
      {
        id: 2,
        seq: 1,
        label: "EDIT",
        summary: "src/auth.ts",
        type: "file_edit",
        path: "src/auth.ts",
        editKind: "StrReplace",
      },
    ]

    expect(sessionFilesFromAgentEvents(events)).toEqual([
      { path: "src/auth.ts", relations: ["read", "edited"] },
    ])
  })
})

describe("formatRelationBadges", () => {
  test("renders relation badges", () => {
    expect(formatRelationBadges(["read", "edited", "created", "deleted"])).toBe("RECD")
  })
})
