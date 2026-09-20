import { cpSync, existsSync, mkdirSync, rmSync, statSync, utimesSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { openDatabase } from "../src/db/schema"
import { resetDatabase, setDatabase } from "../src/core/index"
import { closeDatabase } from "../src/db/schema"
import { timelineEvents } from "../src/core/agent-session"
import { getAgentSession, getSessionTranscript, listProjects, listSessions } from "../src/db/store"
import type { Message } from "../src/core/types"

export const FIXTURE_ROOT = join(import.meta.dir, "..", "fixtures")
export const FIXTURE_PROJECTS = join(FIXTURE_ROOT, "projects")
export const FIXTURE_PLANS = join(FIXTURE_ROOT, "plans")

export function sessionPath(uuid: string): string {
  return join(
    FIXTURE_PROJECTS,
    "Users-fixtureuser-workspace-projects-demo",
    "agent-transcripts",
    uuid,
    `${uuid}.jsonl`,
  )
}

export function createTempFixtureRoot(): string {
  const dir = join(tmpdir(), `ag-explorer-fixtures-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  cpSync(FIXTURE_PROJECTS, join(dir, "projects"), { recursive: true })
  cpSync(FIXTURE_PLANS, join(dir, "plans"), { recursive: true })
  return dir
}

export function createTempDbPath(): string {
  return join(tmpdir(), `ag-explorer-test-${Date.now()}-${Math.random().toString(36).slice(2)}.sqlite`)
}

export function setupTestEnv(options: {
  fixtureRoot?: string
  dbPath: string
}): void {
  const projectsDir = options.fixtureRoot
    ? join(options.fixtureRoot, "projects")
    : FIXTURE_PROJECTS
  const plansDir = options.fixtureRoot ? join(options.fixtureRoot, "plans") : FIXTURE_PLANS
  process.env.CURSOR_CHAT_HISTORY_DIR = projectsDir
  process.env.CURSOR_PLANS_DIR = plansDir
  process.env.AG_EXPLORER_DB_PATH = options.dbPath
  resetDatabase()
  setDatabase(openDatabase(options.dbPath))
}

export function teardownTestEnv(dbPath: string): void {
  resetDatabase()
  if (existsSync(dbPath)) rmSync(dbPath)
}

export async function transcriptSnapshot(dbPath: string): Promise<
  Array<{
    project: string
    sessionTitle: string
    messages: Message[]
    planPaths: string[]
  }>
> {
  const db = openDatabase(dbPath)
  const snapshot: Array<{
    project: string
    sessionTitle: string
    messages: Message[]
    planPaths: string[]
  }> = []

  for (const project of listProjects(db)) {
    for (const session of listSessions(db, project.id)) {
      const transcript = await getSessionTranscript(db, session.id)
      snapshot.push({
        project: project.name,
        sessionTitle: session.title,
        messages: transcript.messages,
        planPaths: transcript.planPaths,
      })
    }
  }

  closeDatabase(db)
  snapshot.sort((a, b) => `${a.project}:${a.sessionTitle}`.localeCompare(`${b.project}:${b.sessionTitle}`))
  return snapshot
}

export function touchFile(path: string, mtimeMs: number): void {
  utimesSync(path, mtimeMs / 1000, mtimeMs / 1000)
}

export function appendToFile(path: string, content: string): void {
  writeFileSync(path, content, { flag: "a" })
  const now = Date.now()
  utimesSync(path, now / 1000, now / 1000)
}

export function ensureDir(path: string): void {
  mkdirSync(path, { recursive: true })
}

export function fileSize(path: string): number {
  return statSync(path).size
}

export async function agentSessionSnapshot(dbPath: string): Promise<
  Array<{
    project: string
    sessionTitle: string
    labels: string[]
    planPaths: string[]
  }>
> {
  const db = openDatabase(dbPath)
  const snapshot: Array<{
    project: string
    sessionTitle: string
    labels: string[]
    planPaths: string[]
  }> = []

  for (const project of listProjects(db)) {
    for (const session of listSessions(db, project.id)) {
      const agentSession = await getAgentSession(db, session.id)
      if (!agentSession) continue
      snapshot.push({
        project: project.name,
        sessionTitle: agentSession.title,
        labels: timelineEvents(agentSession).map((event) => event.label),
        planPaths: agentSession.plan?.paths ?? [],
      })
    }
  }

  closeDatabase(db)
  snapshot.sort((a, b) => `${a.project}:${a.sessionTitle}`.localeCompare(`${b.project}:${b.sessionTitle}`))
  return snapshot
}
