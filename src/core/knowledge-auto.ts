import type { AgentEvent, AgentSession } from "./agent-session"
import { isTimelineVisible } from "./agent-session"
import type { KnowledgeCandidate, KnowledgeItem, KnowledgeType } from "./knowledge"
import { knowledgeCandidateKey, truncateKnowledgeTitle } from "./knowledge"

const TEST_COMMAND_PATTERN =
  /\b(test|vitest|jest|pytest|mocha|cargo test|go test|bun test|npm test|pnpm test|yarn test)\b/i

function isTestCommand(command: string): boolean {
  return TEST_COMMAND_PATTERN.test(command)
}

function isFailingCommand(
  event: AgentEvent,
): event is Extract<AgentEvent, { type: "command" }> {
  return event.type === "command" && event.exitCode !== undefined && event.exitCode !== 0
}

export function proposeKnowledgeCandidates(session: AgentSession): KnowledgeCandidate[] {
  const candidates: KnowledgeCandidate[] = []
  const seen = new Set<string>()

  const push = (candidate: KnowledgeCandidate) => {
    const key = knowledgeCandidateKey(candidate)
    if (seen.has(key)) return
    seen.add(key)
    candidates.push(candidate)
  }

  const events = session.events.filter(isTimelineVisible)
  const sourcePath = session.sourcePath ?? ""

  for (const event of events) {
    if (event.type === "error") {
      push({
        sessionSourcePath: sourcePath,
        eventSeq: event.seq,
        type: "error_solution",
        title: truncateKnowledgeTitle(event.message),
        body: event.message,
        source: "auto",
        meta: { eventKind: event.type },
      })
    }

    if (isFailingCommand(event)) {
      push({
        sessionSourcePath: sourcePath,
        eventSeq: event.seq,
        type: "error_solution",
        title: truncateKnowledgeTitle(`${event.command} (exit ${event.exitCode})`),
        body: event.command,
        source: "auto",
        meta: { eventKind: event.type, exitCode: event.exitCode },
      })
    }

    if (event.type === "plan" && event.overview) {
      push({
        sessionSourcePath: sourcePath,
        eventSeq: event.seq,
        type: "architecture",
        title: truncateKnowledgeTitle(event.name || "Plan"),
        body: event.overview,
        source: "auto",
        meta: { eventKind: event.type, planPath: event.path },
      })
    }
  }

  const testCommands = events.filter(
    (event): event is Extract<AgentEvent, { type: "command" }> =>
      event.type === "command" && isTestCommand(event.command),
  )

  for (const event of testCommands) {
    if (event.exitCode === 0) {
      push({
        sessionSourcePath: sourcePath,
        eventSeq: event.seq,
        type: "command",
        title: truncateKnowledgeTitle(event.command),
        body: event.command,
        source: "auto",
        meta: { eventKind: event.type, exitCode: 0 },
      })
    }
  }

  const firstPrompt = events.find((event) => event.type === "user_prompt")
  if (firstPrompt) {
    push({
      sessionSourcePath: sourcePath,
      eventSeq: firstPrompt.seq,
      type: "decision",
      title: truncateKnowledgeTitle(firstPrompt.text),
      body: firstPrompt.text,
      source: "auto",
      meta: { eventKind: firstPrompt.type },
    })
  }

  return candidates
}

export function filterNewKnowledgeCandidates(
  candidates: KnowledgeCandidate[],
  existing: KnowledgeItem[],
): KnowledgeCandidate[] {
  const existingKeys = new Set(
    existing.map((item) => knowledgeCandidateKey({ type: item.type, title: item.title })),
  )
  return candidates.filter((candidate) => !existingKeys.has(knowledgeCandidateKey(candidate)))
}

export function isAutoKnowledgeEnabled(): boolean {
  const value = process.env.AG_EXPLORER_AUTO_KNOWLEDGE?.trim().toLowerCase()
  return value === "1" || value === "true" || value === "yes"
}

export function autoKnowledgeTypeLabel(type: KnowledgeType): string {
  return type.replace(/_/g, " ")
}
