import { describe, expect, test } from "bun:test"
import type { AgentEvent, AgentSession } from "../../src/core/agent-session"
import type { KnowledgeItem } from "../../src/core/knowledge"
import {
  filterNewKnowledgeCandidates,
  isAutoKnowledgeEnabled,
  proposeKnowledgeCandidates,
} from "../../src/core/knowledge-auto"

const session: AgentSession = {
  id: 1,
  title: "Auth fix",
  project: { id: 1, name: "demo" },
  source: "cursor",
  sourcePath: "/tmp/session.jsonl",
  files: [],
  events: [
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
      type: "error",
      label: "ERROR",
      summary: "Token missing",
      status: "error",
      message: "Token missing",
    },
    {
      id: 3,
      seq: 2,
      type: "plan",
      label: "PLAN",
      summary: "Auth plan",
      name: "Auth plan",
      overview: "Add JWT middleware",
    },
    {
      id: 4,
      seq: 3,
      type: "command",
      label: "RUN",
      summary: "pnpm test",
      command: "pnpm test",
      exitCode: 0,
    },
  ] as AgentEvent[],
}

describe("proposeKnowledgeCandidates", () => {
  test("proposes decision, error, architecture, and successful test command", () => {
    const candidates = proposeKnowledgeCandidates(session)
    const types = candidates.map((candidate) => candidate.type)

    expect(types).toContain("decision")
    expect(types).toContain("error_solution")
    expect(types).toContain("architecture")
    expect(types).toContain("command")
  })

  test("filters duplicates against existing knowledge", () => {
    const candidates = proposeKnowledgeCandidates(session)
    const existing: KnowledgeItem[] = [
      {
        id: 1,
        sessionId: 1,
        sessionSourcePath: session.sourcePath,
        eventSeq: 1,
        type: "error_solution",
        title: "Token missing",
        body: "Token missing",
        source: "auto",
        createdAt: Date.now(),
        meta: {},
      },
    ]

    const filtered = filterNewKnowledgeCandidates(candidates, existing)
    expect(filtered.some((candidate) => candidate.title === "Token missing")).toBe(false)
    expect(filtered.length).toBeGreaterThan(0)
  })
})

describe("isAutoKnowledgeEnabled", () => {
  test("is disabled by default", () => {
    const previous = process.env.AG_EXPLORER_AUTO_KNOWLEDGE
    delete process.env.AG_EXPLORER_AUTO_KNOWLEDGE
    expect(isAutoKnowledgeEnabled()).toBe(false)
    process.env.AG_EXPLORER_AUTO_KNOWLEDGE = previous
  })

  test("accepts truthy env values", () => {
    const previous = process.env.AG_EXPLORER_AUTO_KNOWLEDGE
    process.env.AG_EXPLORER_AUTO_KNOWLEDGE = "1"
    expect(isAutoKnowledgeEnabled()).toBe(true)
    process.env.AG_EXPLORER_AUTO_KNOWLEDGE = previous
  })
})
