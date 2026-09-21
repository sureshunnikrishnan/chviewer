import { homedir } from "node:os"
import { join } from "node:path"
import { expandEnvValue } from "../../core/env"

export const CLAUDE_CODE_PROVIDER_ID = "claude-code"
export const ENV_CLAUDE_PROJECTS_DIR = "CLAUDE_PROJECTS_DIR"
export const ENV_CLAUDE_CONFIG_DIR = "CLAUDE_CONFIG_DIR"

export function resolveClaudeProjectsDir(): string {
  const explicit = process.env.CLAUDE_PROJECTS_DIR
  if (explicit) return expandEnvValue(explicit)

  const configDir = process.env.CLAUDE_CONFIG_DIR
  if (configDir) return join(expandEnvValue(configDir), "projects")

  return join(homedir(), ".claude", "projects")
}

export function formatProjectName(encodedDir: string): string {
  let name = encodedDir.replace(/^-+/, "")
  name = name.replace(/^Users-[^-]+-/, "")
  name = name.replace(/^workspace-/, "")
  return name || encodedDir
}
