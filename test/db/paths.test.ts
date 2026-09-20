import { afterEach, describe, expect, test } from "bun:test"
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  DEFAULT_DB_ENV_VALUE,
  ENV_DB_PATH,
  LEGACY_ENV_DB_PATH,
  loadEnvFile,
  resetLegacyEnvRewrittenForTests,
} from "../../src/core/env"
import {
  defaultDbPath,
  legacyDefaultDbPath,
  resetDbMigrationForTests,
  resolveDbPath,
} from "../../src/db/paths"

const savedEnv = { ...process.env }
const savedHome = process.env.HOME

function withTempHome(): string {
  const home = mkdtempSync(join(tmpdir(), "ag-explorer-home-"))
  process.env.HOME = home
  delete process.env[LEGACY_ENV_DB_PATH]
  delete process.env[ENV_DB_PATH]
  return home
}

afterEach(() => {
  process.env = { ...savedEnv }
  process.env.HOME = savedHome
  resetDbMigrationForTests()
  resetLegacyEnvRewrittenForTests()
})

describe("resolveDbPath migration", () => {
  test("moves legacy default dir to ~/.ag-explorer when target absent", () => {
    const home = withTempHome()
    const legacyPath = legacyDefaultDbPath()
    const defaultPath = defaultDbPath()

    mkdirSync(join(home, ".chviewer"), { recursive: true })
    writeFileSync(legacyPath, "legacy-db", "utf8")
    writeFileSync(`${legacyPath}-wal`, "wal", "utf8")

    expect(resolveDbPath()).toBe(defaultPath)
    expect(existsSync(defaultPath)).toBe(true)
    expect(readFileSync(defaultPath, "utf8")).toBe("legacy-db")
    expect(existsSync(`${defaultPath}-wal`)).toBe(true)
    expect(existsSync(legacyPath)).toBe(false)
    expect(existsSync(join(home, ".chviewer"))).toBe(false)
  })

  test("does not overwrite existing default db", () => {
    const home = withTempHome()
    const legacyPath = legacyDefaultDbPath()
    const defaultPath = defaultDbPath()

    mkdirSync(join(home, ".chviewer"), { recursive: true })
    mkdirSync(join(home, ".ag-explorer"), { recursive: true })
    writeFileSync(legacyPath, "legacy-db", "utf8")
    writeFileSync(defaultPath, "existing-default", "utf8")

    expect(resolveDbPath()).toBe(defaultPath)
    expect(readFileSync(defaultPath, "utf8")).toBe("existing-default")
  })

  test("moves legacy-sourced custom CHVIEWER_DB_PATH to default", () => {
    withTempHome()
    const customDir = mkdtempSync(join(tmpdir(), "ag-explorer-custom-"))
    const customPath = join(customDir, "custom.sqlite")
    writeFileSync(customPath, "custom-db", "utf8")

    process.env[LEGACY_ENV_DB_PATH] = customPath
    delete process.env[ENV_DB_PATH]

    const defaultPath = defaultDbPath()
    expect(resolveDbPath()).toBe(defaultPath)
    expect(readFileSync(defaultPath, "utf8")).toBe("custom-db")
    expect(existsSync(customPath)).toBe(false)
    expect(process.env[LEGACY_ENV_DB_PATH]).toBeUndefined()
  })

  test("respects AG_EXPLORER_DB_PATH when not legacy-sourced", () => {
    withTempHome()
    const customDir = mkdtempSync(join(tmpdir(), "ag-explorer-custom-"))
    const customPath = join(customDir, "custom.sqlite")
    writeFileSync(customPath, "custom-db", "utf8")

    process.env[ENV_DB_PATH] = customPath
    delete process.env[LEGACY_ENV_DB_PATH]

    expect(resolveDbPath()).toBe(customPath)
    expect(readFileSync(customPath, "utf8")).toBe("custom-db")
  })

  test("rewrites .env key and moves custom legacy db to default", () => {
    const home = withTempHome()
    const customDir = mkdtempSync(join(tmpdir(), "ag-explorer-custom-"))
    const customPath = join(customDir, "custom.sqlite")
    writeFileSync(customPath, "custom-db", "utf8")

    const envPath = join(home, ".env")
    writeFileSync(envPath, `${LEGACY_ENV_DB_PATH}=${customPath}\n`, "utf8")

    delete process.env[LEGACY_ENV_DB_PATH]
    delete process.env[ENV_DB_PATH]

    loadEnvFile(envPath)
    const defaultPath = defaultDbPath()
    expect(resolveDbPath()).toBe(defaultPath)
    expect(readFileSync(defaultPath, "utf8")).toBe("custom-db")

    const envText = readFileSync(envPath, "utf8")
    expect(envText).toContain(`${ENV_DB_PATH}=${DEFAULT_DB_ENV_VALUE}`)
    expect(envText).not.toContain(LEGACY_ENV_DB_PATH)
  })

  test("removes legacy key when AG_EXPLORER_DB_PATH already present in .env", () => {
    const home = withTempHome()
    const customPath = join(home, "custom.sqlite")
    writeFileSync(customPath, "custom-db", "utf8")

    const envPath = join(home, ".env")
    writeFileSync(
      envPath,
      `${LEGACY_ENV_DB_PATH}=${legacyDefaultDbPath()}\n${ENV_DB_PATH}=${customPath}\n`,
      "utf8",
    )

    delete process.env[LEGACY_ENV_DB_PATH]
    delete process.env[ENV_DB_PATH]

    loadEnvFile(envPath)
    expect(resolveDbPath()).toBe(customPath)
    expect(readFileSync(customPath, "utf8")).toBe("custom-db")

    const envText = readFileSync(envPath, "utf8")
    expect(envText).toContain(`${ENV_DB_PATH}=${customPath}`)
    expect(envText).not.toContain(LEGACY_ENV_DB_PATH)
  })
})
