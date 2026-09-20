import { readdir, stat } from "node:fs/promises"
import { join } from "node:path"
import type { DiscoveredProject, DiscoveredSession } from "../../core/types"
import { formatWorkspaceName, resolveChatHistoryDir } from "./paths"

const PROVIDER = "cursor"
const ENV_CHAT_HISTORY_DIR = "CURSOR_CHAT_HISTORY_DIR"

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

export async function discoverCursorProjects(
  historyDir = resolveChatHistoryDir(),
): Promise<DiscoveredProject[]> {
  let entries
  try {
    entries = await readdir(historyDir, { withFileTypes: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(
      `Cannot read chat history directory (${ENV_CHAT_HISTORY_DIR}=${historyDir}): ${message}`,
    )
  }

  const projects: DiscoveredProject[] = []

  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    if (entry.name.startsWith(".")) continue

    const source_path = join(historyDir, entry.name)
    const transcriptsDir = join(source_path, "agent-transcripts")
    const sessions = await listSessionFiles(transcriptsDir)
    if (sessions.length === 0) continue

    projects.push({
      provider: PROVIDER,
      name: formatWorkspaceName(entry.name),
      source_path,
      sessions,
    })
  }

  return projects
}
