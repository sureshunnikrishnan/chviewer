import { describe, expect, test } from "bun:test"
import type { AgentEvent } from "../../src/core/agent-session"
import {
  availableTimelineCategories,
  eventMatchesCategory,
  filterTimelineEvents,
  filterTimelineEventsByCategory,
  formatCategoryFilterLine,
  formatTimelineEventName,
  formatTimelinePlain,
  isErrorEvent,
} from "../../src/ui/timeline"

const sampleEvents: AgentEvent[] = [
  {
    id: 1,
    seq: 0,
    type: "user_prompt",
    label: "USER",
    summary: "Fix search bug",
    text: "Fix search bug",
  },
  {
    id: 2,
    seq: 1,
    type: "file_read",
    label: "READ",
    summary: "src/search.ts",
    path: "/tmp/src/search.ts",
  },
  {
    id: 3,
    seq: 2,
    type: "command",
    label: "RUN",
    summary: "pnpm test",
    command: "pnpm test",
    exitCode: 0,
  },
  {
    id: 4,
    seq: 3,
    type: "error",
    label: "ERROR",
    summary: "Tests failed",
    status: "error",
    message: "Tests failed",
  },
  {
    id: 5,
    seq: 4,
    type: "plan",
    label: "PLAN",
    summary: "auth plan",
    name: "auth.plan.md",
  },
]

describe("timeline", () => {
  test("formatTimelinePlain renders label and summary", () => {
    const plain = formatTimelinePlain(sampleEvents)
    expect(plain).toContain("USER  Fix search bug")
    expect(plain).toContain("READ  src/search.ts")
    expect(plain).toContain("RUN  pnpm test")
  })

  test("filterTimelineEvents matches summary and detail", () => {
    const filtered = filterTimelineEvents(sampleEvents, "pnpm")
    expect(filtered).toHaveLength(1)
    expect(filtered[0]?.label).toBe("RUN")
  })

  test("formatTimelineEventName appends checkmark for successful commands", () => {
    expect(formatTimelineEventName(sampleEvents[2]!)).toBe("RUN  pnpm test ✓")
  })

  test("filterTimelineEventsByCategory maps categories", () => {
    expect(filterTimelineEventsByCategory(sampleEvents, "messages")).toHaveLength(1)
    expect(filterTimelineEventsByCategory(sampleEvents, "files")).toHaveLength(1)
    expect(filterTimelineEventsByCategory(sampleEvents, "commands")).toHaveLength(1)
    expect(filterTimelineEventsByCategory(sampleEvents, "errors")).toHaveLength(1)
    expect(filterTimelineEventsByCategory(sampleEvents, "plans")).toHaveLength(1)
  })

  test("isErrorEvent includes failed commands with exit codes", () => {
    const failedCommand: AgentEvent = {
      id: 99,
      seq: 99,
      type: "command",
      label: "RUN",
      summary: "pnpm test",
      command: "pnpm test",
      exitCode: 2,
    }
    expect(isErrorEvent(sampleEvents[3]!)).toBe(true)
    expect(isErrorEvent(failedCommand)).toBe(true)
    expect(isErrorEvent(sampleEvents[2]!)).toBe(false)
  })

  test("eventMatchesCategory and composed text filter", () => {
    expect(eventMatchesCategory(sampleEvents[1]!, "files")).toBe(true)
    expect(eventMatchesCategory(sampleEvents[0]!, "files")).toBe(false)

    const filtered = filterTimelineEvents(sampleEvents, "search", "files")
    expect(filtered).toHaveLength(1)
    expect(filtered[0]?.label).toBe("READ")
  })

  test("formatCategoryFilterLine marks active category", () => {
    expect(formatCategoryFilterLine("commands")).toContain("[commands]")
    expect(formatCategoryFilterLine("commands")).not.toContain("[files]")
  })

  test("availableTimelineCategories omits plans when unsupported", () => {
    const categories = availableTimelineCategories({
      toolCalls: true,
      fileChanges: true,
      commands: true,
      plans: false,
    })
    expect(categories).not.toContain("plans")
    expect(formatCategoryFilterLine("all", categories)).not.toContain("plans")
  })
})
