import type { Database } from "bun:sqlite"
import type { AgentSession } from "../core/agent-session"
import type {
  Message,
  Project,
  SearchFilters,
  SearchResultGroup,
  Session,
  SessionTranscript,
} from "../core/types"
import {
  buildFilterClauses,
  mergeSearchFilters,
  parseSearchQuery,
  truncateSnippet,
} from "../core/search-query"
import { projectCursorEvents, resolvePlanFromEvents } from "../providers/cursor/project"
import { resolvePlanPathsFromPayloads } from "../providers/cursor/plans"
import { getSessionEvents } from "../core/writer"

const MAX_SESSIONS = 50
const MAX_HITS_PER_SESSION = 5

type SearchRow = {
  event_id: number
  seq: number
  session_id: number
  session_title: string
  updated_at: number
  project_id: number
  project_name: string
  snippet_text: string
}

export function listProjects(db: Database): Project[] {
  const rows = db
    .query(
      `SELECT
         p.id,
         p.name,
         COUNT(s.id) AS session_count,
         COALESCE(MAX(s.updated_at), 0) AS last_session_at
       FROM projects p
       LEFT JOIN sessions s ON s.project_id = p.id
       GROUP BY p.id
       ORDER BY last_session_at DESC`,
    )
    .all() as Array<{
    id: number
    name: string
    session_count: number
    last_session_at: number
  }>

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    sessionCount: row.session_count,
    lastSessionAt: row.last_session_at,
  }))
}

export function listSessions(db: Database, projectId: number): Session[] {
  const rows = db
    .query(
      `SELECT
         s.id,
         s.project_id,
         s.title,
         s.started_at,
         s.updated_at,
         s.event_count,
         p.provider
       FROM sessions s
       JOIN projects p ON p.id = s.project_id
       WHERE s.project_id = ?
       ORDER BY s.updated_at DESC`,
    )
    .all(projectId) as Array<{
    id: number
    project_id: number
    title: string
    started_at: number | null
    updated_at: number
    event_count: number
    provider: string
  }>

  return rows.map((row) => ({
    id: row.id,
    projectId: row.project_id,
    title: row.title,
    startedAt: row.started_at,
    updatedAt: row.updated_at,
    eventCount: row.event_count,
    sourceProvider: row.provider,
  }))
}

export async function getSessionTranscript(
  db: Database,
  sessionId: number,
): Promise<SessionTranscript> {
  const events = getSessionEvents(db, sessionId)
  const messages: Message[] = events
    .filter(
      (event) =>
        (event.kind === "user_prompt" || event.kind === "assistant_message") &&
        event.text.trim().length > 0,
    )
    .map((event) => ({
      role: event.role ?? "unknown",
      text: event.text,
    }))

  const planPaths = await resolvePlanPathsFromPayloads(events.map((event) => event.payload))

  return { messages, planPaths }
}

export async function getAgentSession(db: Database, sessionId: number): Promise<AgentSession | null> {
  const row = db
    .query(
      `SELECT
         s.id,
         s.title,
         s.started_at,
         s.updated_at,
         s.project_id,
         p.name AS project_name,
         p.provider
       FROM sessions s
       JOIN projects p ON p.id = s.project_id
       WHERE s.id = ?`,
    )
    .get(sessionId) as
    | {
        id: number
        title: string
        started_at: number | null
        updated_at: number
        project_id: number
        project_name: string
        provider: string
      }
    | null

  if (!row) return null

  const storedEvents = getSessionEvents(db, sessionId)
  const planPaths = await resolvePlanPathsFromPayloads(storedEvents.map((event) => event.payload))
  const events = projectCursorEvents(storedEvents)
  const plan = resolvePlanFromEvents(events, planPaths)

  return {
    id: row.id,
    title: row.title,
    project: { id: row.project_id, name: row.project_name },
    startedAt: row.started_at ? new Date(row.started_at) : undefined,
    updatedAt: new Date(row.updated_at),
    source: row.provider === "cursor" ? "cursor" : "cursor",
    events,
    plan,
  }
}

export function resolveSessionId(db: Database, sessionRef: string): number | null {
  const trimmed = sessionRef.trim()
  if (/^\d+$/.test(trimmed)) {
    const row = db.query("SELECT id FROM sessions WHERE id = ?").get(Number(trimmed)) as
      | { id: number }
      | null
    return row?.id ?? null
  }

  const rows = db
    .query(
      `SELECT id, title FROM sessions
       WHERE title LIKE ? ESCAPE '\\'
       ORDER BY updated_at DESC`,
    )
    .all(`%${trimmed.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_")}%`) as Array<{
    id: number
    title: string
  }>

  if (rows.length === 0) return null
  if (rows.length === 1) return rows[0]!.id

  const exact = rows.find((row) => row.title === trimmed)
  if (exact) return exact.id

  return rows[0]!.id
}

function groupSearchRows(rows: SearchRow[]): SearchResultGroup[] {
  const groups = new Map<number, SearchResultGroup & { updatedAt: number }>()

  for (const row of rows) {
    let group = groups.get(row.session_id)
    if (!group) {
      group = {
        projectId: row.project_id,
        projectName: row.project_name,
        sessionId: row.session_id,
        sessionTitle: row.session_title,
        matchCount: 0,
        hits: [],
        updatedAt: row.updated_at,
      }
      groups.set(row.session_id, group)
    }

    group.matchCount += 1
    group.updatedAt = Math.max(group.updatedAt, row.updated_at)
    if (group.hits.length < MAX_HITS_PER_SESSION) {
      group.hits.push({
        eventId: row.event_id,
        seq: row.seq,
        snippet: truncateSnippet(row.snippet_text),
      })
    }
  }

  return [...groups.values()]
    .sort((a, b) => {
      if (b.matchCount !== a.matchCount) return b.matchCount - a.matchCount
      return b.updatedAt - a.updatedAt
    })
    .slice(0, MAX_SESSIONS)
    .map(({ updatedAt: _updatedAt, ...group }) => group)
}

function runSearchQuery(
  db: Database,
  ftsQuery: string,
  filters: SearchFilters,
): SearchResultGroup[] {
  const { where, params } = buildFilterClauses(filters)
  const filterSql = where.length > 0 ? ` AND ${where.join(" AND ")}` : ""

  let rows: SearchRow[]

  if (ftsQuery) {
    rows = db
      .query(
        `SELECT
           e.id AS event_id,
           e.seq,
           s.id AS session_id,
           s.title AS session_title,
           s.updated_at,
           p.id AS project_id,
           p.name AS project_name,
           e.text AS snippet_text
         FROM events_fts
         JOIN events e ON e.id = events_fts.rowid
         JOIN sessions s ON s.id = e.session_id
         JOIN projects p ON p.id = s.project_id
         WHERE events_fts MATCH ?${filterSql}
         ORDER BY s.updated_at DESC, e.seq ASC
         LIMIT ?`,
      )
      .all(ftsQuery, ...params, MAX_SESSIONS * MAX_HITS_PER_SESSION * 4) as SearchRow[]
  } else {
    rows = db
      .query(
        `SELECT
           e.id AS event_id,
           e.seq,
           s.id AS session_id,
           s.title AS session_title,
           s.updated_at,
           p.id AS project_id,
           p.name AS project_name,
           e.text AS snippet_text
         FROM events e
         JOIN sessions s ON s.id = e.session_id
         JOIN projects p ON p.id = s.project_id
         WHERE 1 = 1${filterSql}
         ORDER BY s.updated_at DESC, e.seq ASC
         LIMIT ?`,
      )
      .all(...params, MAX_SESSIONS * MAX_HITS_PER_SESSION * 4) as SearchRow[]
  }

  return groupSearchRows(rows)
}

export function searchSessions(
  db: Database,
  query: string,
  extraFilters?: Partial<SearchFilters>,
): SearchResultGroup[] {
  const parsed = parseSearchQuery(query)
  const filters = mergeSearchFilters(parsed.filters, extraFilters ?? {})

  if (!parsed.ftsQuery && Object.keys(filters).length === 0) {
    return []
  }

  try {
    return runSearchQuery(db, parsed.ftsQuery, filters)
  } catch {
    return []
  }
}

export function searchEventIds(db: Database, query: string): number[] {
  const groups = searchSessions(db, query)
  return groups.flatMap((group) => group.hits.map((hit) => hit.eventId))
}
