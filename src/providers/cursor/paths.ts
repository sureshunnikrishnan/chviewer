import { homedir } from "node:os"
import { dirname, join } from "node:path"
import { expandEnvValue } from "../../core/env"

const ENV_CHAT_HISTORY_DIR = "CURSOR_CHAT_HISTORY_DIR"
const ENV_AGENT_TRANSCRIPTS = "AGENT_TRANSCRIPTS"
const ENV_PLANS_DIR = "CURSOR_PLANS_DIR"

export function resolveChatHistoryDir(): string {
  const fromEnv = process.env[ENV_CHAT_HISTORY_DIR]?.trim()
  if (fromEnv) return expandEnvValue(fromEnv)

  const agentTranscripts = process.env[ENV_AGENT_TRANSCRIPTS]?.trim()
  if (agentTranscripts) {
    return dirname(dirname(expandEnvValue(agentTranscripts)))
  }

  return join(homedir(), ".cursor", "projects")
}

export function resolvePlansDir(): string {
  const fromEnv = process.env[ENV_PLANS_DIR]?.trim()
  if (fromEnv) return expandEnvValue(fromEnv)
  return join(homedir(), ".cursor", "plans")
}

/**
 * Complete workspace name without the Cursor "workspace-" prefix.
 * Users-<user>-workspace-projects-ag-explorer → projects-ag-explorer
 */
export function formatWorkspaceName(slug: string): string {
  let name = slug.replace(/^Users-[^-]+-/, "")
  name = name.replace(/^workspace-/, "")
  return name || slug
}
