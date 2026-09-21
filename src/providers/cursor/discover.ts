import { readdir, stat } from "node:fs/promises"
import { join } from "node:path"
import type { DiscoveredProject, DiscoveredSession } from "../../core/types"
import type { ProviderProject, ProviderSessionSummary } from "../types"
import { formatWorkspaceName, resolveChatHistoryDir } from "./paths"

export const CURSOR_PROVIDER_ID = "cursor"
const ENV_CHAT_HISTORY_DIR = "CURSOR_CHAT_HISTORY_DIR"

export async function discoverCursorSessions(
  project: ProviderProject,
): Promise<ProviderSessionSummary[]> {
  const transcriptsDir = join(project.sourcePath, "agent-transcripts")
  const sessions = await listSessionFiles(transcriptsDir)
  return sessions.map((session) => ({
    sourcePath: session.source_path,
    sourceMtime: session.source_mtime,
    sourceSize: session.source_size,
  }))
}

async function listSessionFiles(transcriptsDir: string): Promise<DiscoveredSession[]> {
  let entries
  try {
    entries = await readdir(transcriptsDir, { withFileTypes: true })
  } catch {
    return []
  }

  const sessions: DiscoveredSession[] = []
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const candidate = join(transcriptsDir, entry.name, `${entry.name}.jsonl`)
    try {
      const info = await stat(candidate)
      if (info.isFile()) {
        sessions.push({
          source_path: candidate,
          source_mtime: info.mtimeMs,
          source_size: info.size,
        })
      }
    } catch {
      // skip missing/invalid chat folders
    }
  }

  return sessions
}

export async function discoverCursorProjectList(
  historyDir = resolveChatHistoryDir(),
): Promise<ProviderProject[]> {
  let entries
  try {
    entries = await readdir(historyDir, { withFileTypes: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(
      `Cannot read chat history directory (${ENV_CHAT_HISTORY_DIR}=${historyDir}): ${message}`,
    )
  }

  const projects: ProviderProject[] = []

  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    if (entry.name.startsWith(".")) continue

    const sourcePath = join(historyDir, entry.name)
    const transcriptsDir = join(sourcePath, "agent-transcripts")
    const sessions = await listSessionFiles(transcriptsDir)
    if (sessions.length === 0) continue

    projects.push({
      id: sourcePath,
      name: formatWorkspaceName(entry.name),
      sourcePath,
    })
  }

  return projects
}

export async function discoverCursorProjects(
  historyDir = resolveChatHistoryDir(),
): Promise<DiscoveredProject[]> {
  const projectList = await discoverCursorProjectList(historyDir)
  const projects: DiscoveredProject[] = []

  for (const project of projectList) {
    const transcriptsDir = join(project.sourcePath, "agent-transcripts")
    const sessions = await listSessionFiles(transcriptsDir)
    projects.push({
      provider: CURSOR_PROVIDER_ID,
      name: project.name,
      source_path: project.sourcePath,
      sessions,
    })
  }

  return projects
}
