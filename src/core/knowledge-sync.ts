import type { Database } from "bun:sqlite"
import type { AgentSession } from "./agent-session"
import {
  filterNewKnowledgeCandidates,
  isAutoKnowledgeEnabled,
  proposeKnowledgeCandidates,
} from "./knowledge-auto"
import {
  insertKnowledgeCandidate,
  listKnowledgeForSession,
} from "../db/knowledge-store"

export function applyAutoKnowledge(db: Database, session: AgentSession): number {
  if (!isAutoKnowledgeEnabled()) return 0

  const existing = listKnowledgeForSession(db, session.id)
  const candidates = filterNewKnowledgeCandidates(
    proposeKnowledgeCandidates(session),
    existing,
  )

  let inserted = 0
  for (const candidate of candidates) {
    insertKnowledgeCandidate(db, candidate, session.id)
    inserted += 1
  }

  return inserted
}
