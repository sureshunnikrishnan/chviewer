import {
  copyFileSync,
  existsSync,
  mkdirSync,
  renameSync,
  rmdirSync,
  unlinkSync,
} from "node:fs"
import { homedir } from "node:os"
import { dirname, join } from "node:path"
import {
  ENV_DB_PATH,
  LEGACY_ENV_DB_PATH,
  expandEnvValue,
  setAgExplorerDbPathInEnvFile,
  wasLegacyEnvRewritten,
} from "../core/env"

let migrationDone = false

function resolveHome(): string {
  return process.env.HOME?.trim() || homedir()
}

export function defaultDbPath(): string {
  return join(resolveHome(), ".ag-explorer", "index.sqlite")
}

export function legacyDefaultDbPath(): string {
  return join(resolveHome(), ".chviewer", "index.sqlite")
}

function moveDbFiles(source: string, target: string): void {
  mkdirSync(dirname(target), { recursive: true })
  for (const suffix of ["", "-wal", "-shm"]) {
    const src = `${source}${suffix}`
    const dst = `${target}${suffix}`
    if (!existsSync(src)) continue
    try {
      renameSync(src, dst)
    } catch {
      copyFileSync(src, dst)
      unlinkSync(src)
    }
  }
}

function tryRmdirLegacyDir(): void {
  const legacyDir = join(resolveHome(), ".chviewer")
  try {
    rmdirSync(legacyDir)
  } catch {
    // not empty or missing
  }
}

function finalizeLegacyEnv(): void {
  setAgExplorerDbPathInEnvFile()
  delete process.env[LEGACY_ENV_DB_PATH]
  process.env[ENV_DB_PATH] = defaultDbPath()
}

function migrateLegacyDbIfNeeded(): void {
  if (migrationDone) return
  migrationDone = true

  const defaultPath = defaultDbPath()
  const legacyDefaultPath = legacyDefaultDbPath()
  const legacyEnvPath = process.env[LEGACY_ENV_DB_PATH]?.trim()
  const agEnvPath = process.env[ENV_DB_PATH]?.trim()
  const legacyRewritten = wasLegacyEnvRewritten()
  const isLegacySourced = Boolean(legacyEnvPath) || legacyRewritten

  if (isLegacySourced) {
    const source = legacyEnvPath
      ? expandEnvValue(legacyEnvPath)
      : agEnvPath
        ? expandEnvValue(agEnvPath)
        : defaultPath

    if (source === defaultPath) {
      finalizeLegacyEnv()
      return
    }

    if (existsSync(defaultPath)) {
      finalizeLegacyEnv()
      return
    }

    if (existsSync(source)) {
      moveDbFiles(source, defaultPath)
      if (dirname(source) === join(resolveHome(), ".chviewer")) {
        tryRmdirLegacyDir()
      }
    }

    finalizeLegacyEnv()
    return
  }

  if (agEnvPath) {
    return
  }

  if (!existsSync(defaultPath) && existsSync(legacyDefaultPath)) {
    moveDbFiles(legacyDefaultPath, defaultPath)
    tryRmdirLegacyDir()
  }
}

export function resolveDbPath(): string {
  migrateLegacyDbIfNeeded()

  const agEnvPath = process.env[ENV_DB_PATH]?.trim()
  if (agEnvPath) {
    return expandEnvValue(agEnvPath)
  }

  return defaultDbPath()
}

export function resetDbMigrationForTests(): void {
  migrationDone = false
}
