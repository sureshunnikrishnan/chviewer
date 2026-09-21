import { readFile, readdir, stat } from "node:fs/promises"
import { join } from "node:path"
import type { ProviderProject, ProviderSessionSummary } from "../types"
import {
  ENV_CLAUDE_PROJECTS_DIR,
  formatProjectName,
  resolveClaudeProjectsDir,
} from "./paths"

type SessionsIndexEntry = {
  sessionId?: string
  fullPath?: string
  firstPrompt?: string
  fileMtime?: number
}

type SessionsIndex = {
  entries?: SessionsIndexEntry[]
}

async function readSessionsIndex(
  projectDir: string,
): Promise<Map<string, { titleHint?: string; sourceMtime?: number }>> {
  const hints = new Map<string, { titleHint?: string; sourceMtime?: number }>()

  try {
    const raw = await readFile(join(projectDir, "sessions-index.json"), "utf8")
    const index = JSON.parse(raw) as SessionsIndex
    for (const entry of index.entries ?? []) {
      if (!entry.sessionId) continue
      hints.set(entry.sessionId, {
        titleHint: entry.firstPrompt,
        sourceMtime: entry.fileMtime,
      })
    }
  } catch {
    // optional index file
  }

  return hints
}

async function listTopLevelSessions(projectDir: string): Promise<ProviderSessionSummary[]> {
  let entries
  try {
    entries = await readdir(projectDir, { withFileTypes: true })
  } catch {
    return []
  }

  const hints = await readSessionsIndex(projectDir)
  const sessions: ProviderSessionSummary[] = []

  for (const entry of entries) {
    if (!entry.isFile()) continue
    if (!entry.name.endsWith(".jsonl")) continue

    const sourcePath = join(projectDir, entry.name)
    try {
      const info = await stat(sourcePath)
      const sessionId = entry.name.replace(/\.jsonl$/, "")
      const hint = hints.get(sessionId)
      sessions.push({
        sourcePath,
        sourceMtime: info.mtimeMs,
        sourceSize: info.size,
        titleHint: hint?.titleHint,
      })
    } catch {
      // skip missing/invalid session files
    }
  }

  return sessions
}

export async function discoverClaudeCodeProjects(
  projectsDir = resolveClaudeProjectsDir(),
): Promise<ProviderProject[]> {
  let entries
  try {
    entries = await readdir(projectsDir, { withFileTypes: true })
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? error.code : undefined
    if (code === "ENOENT") return []
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(
      `Cannot read Claude Code projects directory (${ENV_CLAUDE_PROJECTS_DIR}=${projectsDir}): ${message}`,
    )
  }

  const projects: ProviderProject[] = []

  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    if (entry.name.startsWith(".")) continue

    const sourcePath = join(projectsDir, entry.name)
    const sessions = await listTopLevelSessions(sourcePath)
    if (sessions.length === 0) continue

    projects.push({
      id: sourcePath,
      name: formatProjectName(entry.name),
      sourcePath,
    })
  }

  return projects
}

export async function discoverClaudeCodeSessions(
  project: ProviderProject,
): Promise<ProviderSessionSummary[]> {
  return listTopLevelSessions(project.sourcePath)
}
