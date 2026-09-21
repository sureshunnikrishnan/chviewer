import type { Database } from "bun:sqlite"
import type { KnowledgeCandidate, KnowledgeItem, KnowledgeSource, KnowledgeType } from "../core/knowledge"

type KnowledgeRow = {
  id: number
  session_id: number | null
  session_source_path: string
  event_seq: number | null
  type: string
  title: string
  body: string
  source: string
  created_at: number
  meta_json: string
}

function rowToItem(row: KnowledgeRow): KnowledgeItem {
  let meta: Record<string, unknown> = {}
  try {
    meta = JSON.parse(row.meta_json) as Record<string, unknown>
  } catch {
    meta = {}
  }

  return {
    id: row.id,
    sessionId: row.session_id,
    sessionSourcePath: row.session_source_path,
    eventSeq: row.event_seq,
    type: row.type as KnowledgeType,
    title: row.title,
    body: row.body,
    source: row.source as KnowledgeSource,
    createdAt: row.created_at,
    meta,
  }
}

export function rematchKnowledgeSessionIds(db: Database): number {
  const result = db.run(
    `UPDATE knowledge_items
     SET session_id = (
       SELECT id FROM sessions WHERE sessions.source_path = knowledge_items.session_source_path
     )
     WHERE session_source_path IN (SELECT source_path FROM sessions)`,
  )
  return result.changes
}

export function insertKnowledge(
  db: Database,
  item: Omit<KnowledgeItem, "id" | "createdAt"> & { createdAt?: number },
): KnowledgeItem {
  const createdAt = item.createdAt ?? Date.now()
  const result = db.run(
    `INSERT INTO knowledge_items (
       session_id, session_source_path, event_seq, type, title, body, source, created_at, meta_json
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      item.sessionId,
      item.sessionSourcePath,
      item.eventSeq,
      item.type,
      item.title,
      item.body,
      item.source,
      createdAt,
      JSON.stringify(item.meta ?? {}),
    ],
  )

  const row = db
    .query("SELECT * FROM knowledge_items WHERE id = ?")
    .get(Number(result.lastInsertRowid)) as KnowledgeRow

  return rowToItem(row)
}

export function insertKnowledgeCandidate(
  db: Database,
  candidate: KnowledgeCandidate,
  sessionId: number | null,
): KnowledgeItem {
  return insertKnowledge(db, {
    sessionId,
    sessionSourcePath: candidate.sessionSourcePath,
    eventSeq: candidate.eventSeq,
    type: candidate.type,
    title: candidate.title,
    body: candidate.body,
    source: candidate.source,
    meta: candidate.meta ?? {},
  })
}

export function listKnowledgeForSession(db: Database, sessionId: number): KnowledgeItem[] {
  const rows = db
    .query(
      `SELECT * FROM knowledge_items
       WHERE session_id = ?
       ORDER BY created_at DESC, id DESC`,
    )
    .all(sessionId) as KnowledgeRow[]

  return rows.map(rowToItem)
}

export function listKnowledge(db: Database, limit = 200): KnowledgeItem[] {
  const rows = db
    .query(
      `SELECT k.* FROM knowledge_items k
       LEFT JOIN sessions s ON s.id = k.session_id
       ORDER BY k.created_at DESC, k.id DESC
       LIMIT ?`,
    )
    .all(limit) as KnowledgeRow[]

  return rows.map(rowToItem)
}

export function deleteKnowledge(db: Database, id: number): boolean {
  const result = db.run("DELETE FROM knowledge_items WHERE id = ?", [id])
  return result.changes > 0
}

export function getSessionSourcePath(db: Database, sessionId: number): string | null {
  const row = db
    .query("SELECT source_path FROM sessions WHERE id = ?")
    .get(sessionId) as { source_path: string } | null
  return row?.source_path ?? null
}

