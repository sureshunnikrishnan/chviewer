import type { AgentEvent } from "./agent-session"
import { formatEventDetailPlain } from "../ui/event-detail"

export type KnowledgeType =
  | "decision"
  | "solution"
  | "error_solution"
  | "pattern"
  | "command"
  | "architecture"
  | "todo"

export type KnowledgeSource = "bookmark" | "auto"

export type KnowledgeItem = {
  id: number
  sessionId: number | null
  sessionSourcePath: string
  eventSeq: number | null
  type: KnowledgeType
  title: string
  body: string
  source: KnowledgeSource
  createdAt: number
  meta: Record<string, unknown>
}

export type KnowledgeCandidate = {
  sessionSourcePath: string
  eventSeq: number | null
  type: KnowledgeType
  title: string
  body: string
  source: KnowledgeSource
  meta?: Record<string, unknown>
}

const TITLE_MAX = 120

export function truncateKnowledgeTitle(text: string): string {
  const collapsed = text.trim().replace(/\s+/g, " ")
  if (collapsed.length <= TITLE_MAX) return collapsed
  return `${collapsed.slice(0, TITLE_MAX - 1)}…`
}

function isFailingCommand(event: AgentEvent): boolean {
  return event.type === "command" && event.exitCode !== undefined && event.exitCode !== 0
}

export function inferKnowledgeTypeFromEvent(event: AgentEvent): KnowledgeType {
  if (event.type === "error" || isFailingCommand(event)) return "error_solution"
  if (event.type === "command") return "command"
  if (event.type === "plan") return "architecture"
  if (event.type === "user_prompt") return "decision"
  return "solution"
}

export function knowledgeFromEvent(
  event: AgentEvent,
  sessionSourcePath: string,
  sessionId: number | null,
  source: KnowledgeSource = "bookmark",
): Omit<KnowledgeItem, "id" | "createdAt"> {
  return {
    sessionId,
    sessionSourcePath,
    eventSeq: event.seq,
    type: inferKnowledgeTypeFromEvent(event),
    title: truncateKnowledgeTitle(event.summary || event.label),
    body: formatEventDetailPlain(event),
    source,
    meta: {
      eventKind: event.type,
      eventLabel: event.label,
    },
  }
}

export function knowledgeCandidateKey(candidate: Pick<KnowledgeCandidate, "type" | "title">): string {
  return `${candidate.type}:${candidate.title}`
}

export function formatKnowledgeItemPlain(item: KnowledgeItem): string {
  const sessionRef = item.sessionId !== null ? `session ${item.sessionId}` : item.sessionSourcePath
  return [
    `[${item.type}] ${item.title}`,
    `Source: ${item.source} · ${sessionRef}`,
    "",
    item.body,
  ].join("\n")
}

export function formatKnowledgeListPlain(items: KnowledgeItem[]): string {
  if (items.length === 0) return "No knowledge items.\n"

  return items
    .map((item) => {
      const sessionRef = item.sessionId !== null ? `#${item.sessionId}` : item.sessionSourcePath
      return `- [${item.type}] ${item.title} (${item.source}, ${sessionRef})`
    })
    .join("\n")
    .concat("\n")
}
