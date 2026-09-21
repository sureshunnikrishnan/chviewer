import { existsSync, readFileSync } from "node:fs"
import { getLoadedEnvFilePath } from "../core/env"
import { allProviders } from "./registry"

export type ConfiguredProvider = {
  id: string
  label: string
}

const PROVIDER_ENV_KEYS: Record<string, string[]> = {
  cursor: ["CURSOR_CHAT_HISTORY_DIR", "AGENT_TRANSCRIPTS"],
  "claude-code": ["CLAUDE_PROJECTS_DIR", "CLAUDE_CONFIG_DIR"],
}

const PROVIDER_LABELS: Record<string, string> = {
  cursor: "Cursor",
  "claude-code": "Claude Code",
}

function parseEnvKey(rawLine: string): string | null {
  const line = rawLine.trim()
  if (!line || line.startsWith("#")) return null
  const eq = line.indexOf("=")
  if (eq <= 0) return null
  return line.slice(0, eq).trim()
}

export function parseEnvFileKeys(filePath: string): Set<string> {
  const keys = new Set<string>()
  if (!existsSync(filePath)) return keys

  const text = readFileSync(filePath, "utf8")
  for (const rawLine of text.split(/\r?\n/)) {
    const key = parseEnvKey(rawLine)
    if (key) keys.add(key)
  }

  return keys
}

function isConfiguredViaEnvFile(id: string, envFilePath: string): boolean {
  const keys = PROVIDER_ENV_KEYS[id]
  if (!keys) return false

  if (!existsSync(envFilePath)) {
    return keys.some((key) => process.env[key]?.trim())
  }

  const fileKeys = parseEnvFileKeys(envFilePath)
  return keys.some((key) => fileKeys.has(key))
}

export function isProviderConfigured(id: string): boolean {
  return isConfiguredViaEnvFile(id, getLoadedEnvFilePath())
}

export function listConfiguredProviders(): ConfiguredProvider[] {
  const envFilePath = getLoadedEnvFilePath()

  return allProviders()
    .filter((provider) => isConfiguredViaEnvFile(provider.id, envFilePath))
    .map((provider) => ({
      id: provider.id,
      label: PROVIDER_LABELS[provider.id] ?? provider.id,
    }))
}
