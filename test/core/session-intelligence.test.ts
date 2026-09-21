import { describe, expect, test } from "bun:test"
import type { AgentEvent, AgentSession } from "../../src/core/agent-session"
import {
  formatCompactOutcome,
  sessionIntelligence,
  sessionOutcome,
} from "../../src/core/session-intelligence"

const baseSession = (events: AgentEvent[]): AgentSession => ({
  id: 1,
  title: "Fix auth",
  project: { id: 1, name: "demo" },
  source: "cursor",
  sourcePath: "/tmp/session.jsonl",
  files: [
    { path: "src/auth.ts", relations: ["read", "edited"] },
    { path: "src/token.ts", relations: ["edited"] },
    { path: "package.json", relations: ["read"] },
  ],
  events,
})

const events: AgentEvent[] = [
  {
    id: 1,
    seq: 0,
    type: "user_prompt",
    label: "USER",
    summary: "Fix JWT auth",
    text: "Fix JWT auth in the login flow",
  },
  {
    id: 2,
    seq: 1,
    type: "command",
    label: "RUN",
    summary: "pnpm test",
    command: "pnpm test",
    exitCode: 1,
  },
  {
    id: 3,
    seq: 2,
    type: "error",
    label: "ERROR",
    summary: "Assertion failed",
    status: "error",
    message: "Assertion failed: token missing",
  },
  {
    id: 4,
    seq: 3,
    type: "command",
    label: "RUN",
    command: "pnpm add jsonwebtoken",
    summary: "pnpm add jsonwebtoken",
  },
  {
    id: 5,
    seq: 4,
    type: "command",
    label: "RUN",
    summary: "pnpm test",
    command: "pnpm test",
    exitCode: 0,
  },
]

describe("sessionIntelligence", () => {
  test("extracts problem, files, commands, errors, languages, and libraries", () => {
    const intelligence = sessionIntelligence(baseSession(events))

    expect(intelligence.problem).toBe("Fix JWT auth in the login flow")
    expect(intelligence.filesInvolved).toEqual(["src/auth.ts", "src/token.ts", "package.json"])
    expect(intelligence.commands).toEqual(["pnpm test", "pnpm add jsonwebtoken", "pnpm test"])
    expect(intelligence.errors).toEqual([
      "pnpm test (exit 1)",
      "Assertion failed: token missing",
    ])
    expect(intelligence.languages).toContain("TypeScript")
    expect(intelligence.libraries).toContain("jsonwebtoken")
    expect(intelligence.successfulResolution).toBe(true)
  })

  test("leaves resolution unknown when exit codes are missing", () => {
    const unknownEvents: AgentEvent[] = [
      {
        id: 1,
        seq: 0,
        type: "command",
        label: "RUN",
        summary: "pnpm test",
        command: "pnpm test",
      },
    ]

    const intelligence = sessionIntelligence(baseSession(unknownEvents))
    expect(intelligence.successfulResolution).toBeNull()
  })
})

describe("sessionOutcome", () => {
  test("reports test outcome and final command", () => {
    const outcome = sessionOutcome(baseSession(events))

    expect(outcome.tests).toBe("mixed")
    expect(outcome.filesModified).toBe(2)
    expect(outcome.errorsEncountered).toBe(2)
    expect(outcome.finalCommand).toBe("pnpm test")
  })

  test("formatCompactOutcome hides unknown tests", () => {
    const outcome = sessionOutcome({
      ...baseSession([
        {
          id: 1,
          seq: 0,
          type: "command",
          label: "RUN",
          summary: "pnpm lint",
          command: "pnpm lint",
        },
      ]),
      files: [],
    })

    expect(formatCompactOutcome(outcome)).toBe("")
  })
})
