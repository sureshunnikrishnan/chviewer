import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { basename, dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..")

export const ENV_DB_PATH = "AG_EXPLORER_DB_PATH"
export const LEGACY_ENV_DB_PATH = "CHVIEWER_DB_PATH"
export const DEFAULT_DB_ENV_VALUE = "$HOME/.ag-explorer/index.sqlite"

let legacyEnvRewritten = false
let loadedEnvFilePath: string | null = null

export function wasLegacyEnvRewritten(): boolean {
  return legacyEnvRewritten
}

export function getLoadedEnvFilePath(): string {
  return loadedEnvFilePath ?? resolve(PROJECT_ROOT, ".env")
}

export function resetLegacyEnvRewrittenForTests(): void {
  legacyEnvRewritten = false
  loadedEnvFilePath = null
}

function atomicWrite(filePath: string, content: string): void {
  const tmp = joinTemp(filePath)
  writeFileSync(tmp, content, "utf8")
  renameSync(tmp, filePath)
}

function joinTemp(filePath: string): string {
  return resolve(dirname(filePath), `.${basename(filePath)}.tmp.${process.pid}`)
}

function parseEnvKey(rawLine: string): string | null {
  const line = rawLine.trim()
  if (!line || line.startsWith("#")) return null
  const eq = line.indexOf("=")
  if (eq <= 0) return null
  return line.slice(0, eq).trim()
}

function migrateLegacyEnvKeys(filePath: string): void {
  const text = readFileSync(filePath, "utf8")
  const lines = text.split(/\r?\n/)

  let hasLegacy = false
  let hasAg = false
  for (const line of lines) {
    const key = parseEnvKey(line)
    if (key === LEGACY_ENV_DB_PATH) hasLegacy = true
    if (key === ENV_DB_PATH) hasAg = true
  }
  if (!hasLegacy) return

  let newLines: string[]
  if (!hasAg) {
    legacyEnvRewritten = true
    newLines = lines.map((line) => {
      const key = parseEnvKey(line)
      if (key !== LEGACY_ENV_DB_PATH) return line
      return line.replace(/^(\s*)CHVIEWER_DB_PATH(\s*=)/, "$1AG_EXPLORER_DB_PATH$2")
    })
  } else {
    newLines = lines.filter((line) => parseEnvKey(line) !== LEGACY_ENV_DB_PATH)
  }

  atomicWrite(filePath, newLines.join("\n"))
}

/** Load key=value pairs from a .env file without overriding existing process.env. */
export function loadEnvFile(filePath = resolve(PROJECT_ROOT, ".env")): void {
  legacyEnvRewritten = false
  loadedEnvFilePath = filePath
  if (existsSync(filePath)) {
    migrateLegacyEnvKeys(filePath)
  }
  if (!existsSync(filePath)) return

  const text = readFileSync(filePath, "utf8")
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith("#")) continue

    const eq = line.indexOf("=")
    if (eq <= 0) continue

    const key = line.slice(0, eq).trim()
    if (!key || process.env[key] !== undefined) continue

    let value = line.slice(eq + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }

    process.env[key] = expandEnvValue(value)
  }
}

export function setAgExplorerDbPathInEnvFile(
  value = DEFAULT_DB_ENV_VALUE,
  filePath = getLoadedEnvFilePath(),
): void {
  if (!existsSync(filePath)) return

  const text = readFileSync(filePath, "utf8")
  const lines = text.split(/\r?\n/)
  let found = false
  const newLines = lines.map((line) => {
    const key = parseEnvKey(line)
    if (key !== ENV_DB_PATH) return line
    found = true
    const indent = line.match(/^(\s*)/)?.[1] ?? ""
    return `${indent}${ENV_DB_PATH}=${value}`
  })

  if (found) {
    atomicWrite(filePath, newLines.join("\n"))
  }
}

/** Expand ~ and $HOME / ${HOME} in path-like env values. */
export function expandEnvValue(value: string): string {
  const home = homedir()
  return value
    .replace(/^~/g, home)
    .replace(/\$\{HOME\}/g, home)
    .replace(/\$HOME/g, home)
}
