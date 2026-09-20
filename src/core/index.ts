import type { Database } from "bun:sqlite"
import { discoverCursorProjects } from "../providers/cursor/discover"
import { parseSessionFile } from "../providers/cursor/parse"
import { closeDatabase, migrate, openDatabase } from "../db/schema"
import { resolveDbPath } from "../db/paths"
import type { IndexSummary } from "./types"
import {
  clearAllIndexedData,
  deleteProject,
  deleteSession,
  importSession,
  listIndexedProjects,
  listIndexedSessions,
  upsertProject,
} from "./writer"

let dbInstance: Database | null = null

export function getDatabase(): Database {
  if (!dbInstance) {
    dbInstance = openDatabase()
  }
  return dbInstance
}

export function setDatabase(db: Database): void {
  dbInstance = db
}

export function resetDatabase(): void {
  if (dbInstance) {
    closeDatabase(dbInstance)
    dbInstance = null
  }
}

function emptySummary(): IndexSummary {
  return {
    projectsAdded: 0,
    projectsUpdated: 0,
    projectsRemoved: 0,
    sessionsAdded: 0,
    sessionsUpdated: 0,
    sessionsRemoved: 0,
    sessionsSkipped: 0,
    eventsIndexed: 0,
  }
}

export function formatIndexSummary(summary: IndexSummary): string {
  return [
    `projects: +${summary.projectsAdded} ~${summary.projectsUpdated} -${summary.projectsRemoved}`,
    `sessions: +${summary.sessionsAdded} ~${summary.sessionsUpdated} -${summary.sessionsRemoved} skipped ${summary.sessionsSkipped}`,
    `events indexed: ${summary.eventsIndexed}`,
  ].join("\n")
}

export async function sync(db = getDatabase()): Promise<IndexSummary> {
  migrate(db)
  const summary = emptySummary()

  const discovered = await discoverCursorProjects()
  const discoveredProjectPaths = new Set(discovered.map((project) => project.source_path))
  const discoveredSessionPaths = new Set(
    discovered.flatMap((project) => project.sessions.map((session) => session.source_path)),
  )

  const indexedProjects = listIndexedProjects(db)
  const indexedProjectsByPath = new Map(indexedProjects.map((project) => [project.source_path, project]))
  const indexedSessions = listIndexedSessions(db)
  const indexedSessionsByPath = new Map(
    indexedSessions.map((session) => [session.source_path, session]),
  )

  for (const project of discovered) {
    const existing = indexedProjectsByPath.get(project.source_path)
    const projectId = upsertProject(db, project.provider, project.name, project.source_path)

    if (existing) summary.projectsUpdated++
    else summary.projectsAdded++

    for (const session of project.sessions) {
      const indexed = indexedSessionsByPath.get(session.source_path)
      const unchanged =
        indexed &&
        indexed.source_mtime === session.source_mtime &&
        indexed.source_size === session.source_size

      if (unchanged) {
        summary.sessionsSkipped++
        continue
      }

      try {
        const parsed = await parseSessionFile(session.source_path)
        importSession(
          db,
          projectId,
          session.source_path,
          session.source_mtime,
          session.source_size,
          parsed,
        )
        summary.eventsIndexed += parsed.events.length

        if (indexed) summary.sessionsUpdated++
        else summary.sessionsAdded++
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        console.error(`Failed to index session ${session.source_path}: ${message}`)
      }
    }
  }

  for (const session of indexedSessions) {
    if (!discoveredSessionPaths.has(session.source_path)) {
      deleteSession(db, session.id)
      summary.sessionsRemoved++
    }
  }

  for (const project of indexedProjects) {
    if (!discoveredProjectPaths.has(project.source_path)) {
      deleteProject(db, project.id)
      summary.projectsRemoved++
    }
  }

  return summary
}

export async function rebuild(db = getDatabase()): Promise<IndexSummary> {
  migrate(db)
  clearAllIndexedData(db)
  return sync(db)
}

export async function index(db = getDatabase()): Promise<IndexSummary> {
  migrate(db)
  return sync(db)
}

export function getDbPath(): string {
  return resolveDbPath()
}
