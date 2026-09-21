import type { Database } from "bun:sqlite"
import { closeDatabase, migrate, openDatabase } from "../db/schema"
import { resolveDbPath } from "../db/paths"
import { allProviders } from "../providers/registry"
import type { IndexSummary } from "./types"
import { rematchKnowledgeSessionIds } from "../db/knowledge-store"
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

function projectKey(provider: string, sourcePath: string): string {
  return `${provider}:${sourcePath}`
}

export async function sync(db = getDatabase()): Promise<IndexSummary> {
  migrate(db)
  const summary = emptySummary()

  const discoveredProjectKeys = new Set<string>()
  const discoveredSessionPaths = new Set<string>()
  const indexedProjects = listIndexedProjects(db)
  const indexedProjectsByKey = new Map(
    indexedProjects.map((project) => [projectKey(project.provider, project.source_path), project]),
  )
  const indexedSessions = listIndexedSessions(db)
  const indexedSessionsByPath = new Map(
    indexedSessions.map((session) => [session.source_path, session]),
  )

  for (const provider of allProviders()) {
    let projects
    try {
      projects = await provider.discoverProjects()
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.error(`Failed to discover ${provider.id} projects: ${message}`)
      continue
    }

    for (const project of projects) {
      const key = projectKey(provider.id, project.sourcePath)
      discoveredProjectKeys.add(key)

      const existing = indexedProjectsByKey.get(key)
      const projectId = upsertProject(db, provider.id, project.name, project.sourcePath)

      if (existing) summary.projectsUpdated++
      else summary.projectsAdded++

      let sessions
      try {
        sessions = await provider.discoverSessions(project)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        console.error(
          `Failed to discover ${provider.id} sessions for ${project.sourcePath}: ${message}`,
        )
        continue
      }

      for (const session of sessions) {
        discoveredSessionPaths.add(session.sourcePath)

        const indexed = indexedSessionsByPath.get(session.sourcePath)
        const unchanged =
          indexed &&
          indexed.source_mtime === session.sourceMtime &&
          indexed.source_size === session.sourceSize

        if (unchanged) {
          summary.sessionsSkipped++
          continue
        }

        try {
          const parsed = await provider.loadSession(session)
          importSession(
            db,
            projectId,
            session.sourcePath,
            session.sourceMtime,
            session.sourceSize,
            parsed,
          )
          summary.eventsIndexed += parsed.events.length

          if (indexed) summary.sessionsUpdated++
          else summary.sessionsAdded++
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          console.error(`Failed to index session ${session.sourcePath}: ${message}`)
        }
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
    if (!discoveredProjectKeys.has(projectKey(project.provider, project.source_path))) {
      deleteProject(db, project.id)
      summary.projectsRemoved++
    }
  }

  rematchKnowledgeSessionIds(db)

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
