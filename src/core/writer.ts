import type { Database } from "bun:sqlite"
import { searchableText } from "./search-text"
import type { NormalizedEvent, ParsedSession, StoredEvent } from "./types"

type ProjectRow = {
  id: number
  source_path: string
}

type SessionRow = {
  id: number
  source_path: string
  source_mtime: number
  source_size: number
}

export function listIndexedProjects(db: Database): ProjectRow[] {
  return db
    .query("SELECT id, source_path FROM projects")
    .all() as ProjectRow[]
}

export function listIndexedSessions(db: Database): SessionRow[] {
  return db
    .query("SELECT id, source_path, source_mtime, source_size FROM sessions")
    .all() as SessionRow[]
}

export function upsertProject(
  db: Database,
  provider: string,
  name: string,
  source_path: string,
): number {
  db.run(
    `INSERT INTO projects (provider, name, source_path)
     VALUES (?, ?, ?)
     ON CONFLICT(provider, source_path) DO UPDATE SET name = excluded.name`,
    [provider, name, source_path],
  )

  const row = db
    .query("SELECT id FROM projects WHERE provider = ? AND source_path = ?")
    .get(provider, source_path) as { id: number }

  return row.id
}

export function importSession(
  db: Database,
  projectId: number,
  source_path: string,
  source_mtime: number,
  source_size: number,
  parsed: ParsedSession,
): number {
  const importTx = db.transaction(() => {
    db.run(
      `INSERT INTO sessions (project_id, title, source_path, source_mtime, source_size, started_at, updated_at, event_count)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(source_path) DO UPDATE SET
         project_id = excluded.project_id,
         title = excluded.title,
         source_mtime = excluded.source_mtime,
         source_size = excluded.source_size,
         started_at = excluded.started_at,
         updated_at = excluded.updated_at,
         event_count = excluded.event_count`,
      [
        projectId,
        parsed.title,
        source_path,
        source_mtime,
        source_size,
        parsed.started_at,
        parsed.updated_at,
        parsed.events.length,
      ],
    )

    const sessionRow = db
      .query("SELECT id FROM sessions WHERE source_path = ?")
      .get(source_path) as { id: number }

    const sessionId = sessionRow.id

    db.run("DELETE FROM events WHERE session_id = ?", [sessionId])

    const insertEvent = db.prepare(
      `INSERT INTO events (session_id, seq, kind, role, text, payload_json, source_offset, timestamp)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )

    parsed.events.forEach((event, seq) => {
      insertEvent.run(
        sessionId,
        seq,
        event.kind,
        event.role,
        searchableText(event),
        JSON.stringify(event.payload),
        event.source_offset,
        event.timestamp,
      )
    })

    return sessionId
  })

  return importTx()
}

export function deleteSession(db: Database, sessionId: number): void {
  db.run("DELETE FROM sessions WHERE id = ?", [sessionId])
}

export function deleteProject(db: Database, projectId: number): void {
  db.run("DELETE FROM projects WHERE id = ?", [projectId])
}

export function clearAllIndexedData(db: Database): void {
  const clearTx = db.transaction(() => {
    db.run("DELETE FROM events")
    db.run("DELETE FROM sessions")
    db.run("DELETE FROM projects")
  })
  clearTx()
}

export function countEventsForSession(db: Database, sessionId: number): number {
  const row = db
    .query("SELECT COUNT(*) AS count FROM events WHERE session_id = ?")
    .get(sessionId) as { count: number }
  return row.count
}

export function getSessionEvents(db: Database, sessionId: number): StoredEvent[] {
  const rows = db
    .query(
      `SELECT id, seq, kind, role, text, payload_json, source_offset, timestamp
       FROM events WHERE session_id = ? ORDER BY seq ASC`,
    )
    .all(sessionId) as Array<{
    id: number
    seq: number
    kind: NormalizedEvent["kind"]
    role: string | null
    text: string
    payload_json: string
    source_offset: number
    timestamp: number | null
  }>

  return rows.map((row) => ({
    id: row.id,
    seq: row.seq,
    kind: row.kind,
    role: row.role,
    text: row.text,
    payload: JSON.parse(row.payload_json) as Record<string, unknown>,
    source_offset: row.source_offset,
    timestamp: row.timestamp,
  }))
}
