import { afterEach, describe, expect, test } from "bun:test"
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  ENV_DB_PATH,
  LEGACY_ENV_DB_PATH,
  expandEnvValue,
  loadEnvFile,
  resetLegacyEnvRewrittenForTests,
  wasLegacyEnvRewritten,
} from "../src/core/env"

const savedEnv = { ...process.env }

afterEach(() => {
  process.env = { ...savedEnv }
  resetLegacyEnvRewrittenForTests()
})

describe("expandEnvValue", () => {
  test("expands leading tilde", () => {
    expect(expandEnvValue("~/projects/demo")).toBe(
      join(process.env.HOME ?? "", "projects/demo"),
    )
  })

  test("expands $HOME and ${HOME}", () => {
    const home = process.env.HOME ?? ""
    expect(expandEnvValue("$HOME/.cursor/plans")).toBe(`${home}/.cursor/plans`)
    expect(expandEnvValue("${HOME}/.cursor/projects")).toBe(`${home}/.cursor/projects`)
  })

  test("leaves plain paths unchanged", () => {
    expect(expandEnvValue("/tmp/fixture-projects")).toBe("/tmp/fixture-projects")
  })
})

describe("loadEnvFile", () => {
  test("loads key=value pairs without overriding existing env", () => {
    const dir = mkdtempSync(join(tmpdir(), "ag-explorer-env-"))
    const envPath = join(dir, ".env")
    writeFileSync(
      envPath,
      [
        "CURSOR_CHAT_HISTORY_DIR=/tmp/from-file",
        "CURSOR_PLANS_DIR=/tmp/plans-from-file",
        "# comment",
        "",
        "EMPTY=",
      ].join("\n"),
      "utf8",
    )

    delete process.env.CURSOR_CHAT_HISTORY_DIR
    process.env.CURSOR_PLANS_DIR = "/tmp/already-set"

    loadEnvFile(envPath)

    expect(process.env.CURSOR_CHAT_HISTORY_DIR).toBe("/tmp/from-file")
    expect(process.env.CURSOR_PLANS_DIR).toBe("/tmp/already-set")
  })

  test("expands home in loaded values", () => {
    const dir = mkdtempSync(join(tmpdir(), "ag-explorer-env-"))
    const envPath = join(dir, ".env")
    writeFileSync(envPath, "CURSOR_CHAT_HISTORY_DIR=~/fixture-projects\n", "utf8")

    delete process.env.CURSOR_CHAT_HISTORY_DIR
    loadEnvFile(envPath)

    expect(process.env.CURSOR_CHAT_HISTORY_DIR).toBe(
      join(process.env.HOME ?? "", "fixture-projects"),
    )
  })

  test("ignores missing file", () => {
    expect(() => loadEnvFile(join(tmpdir(), "missing-ag-explorer-env-file"))).not.toThrow()
  })

  test("rewrites CHVIEWER_DB_PATH to AG_EXPLORER_DB_PATH when AG absent", () => {
    const dir = mkdtempSync(join(tmpdir(), "ag-explorer-env-"))
    const envPath = join(dir, ".env")
    writeFileSync(envPath, `${LEGACY_ENV_DB_PATH}=/tmp/custom.sqlite\n`, "utf8")

    delete process.env[LEGACY_ENV_DB_PATH]
    delete process.env[ENV_DB_PATH]

    loadEnvFile(envPath)

    expect(wasLegacyEnvRewritten()).toBe(true)
    expect(process.env[ENV_DB_PATH]).toBe("/tmp/custom.sqlite")
    expect(readFileSync(envPath, "utf8")).toContain(`${ENV_DB_PATH}=/tmp/custom.sqlite`)
    expect(readFileSync(envPath, "utf8")).not.toContain(LEGACY_ENV_DB_PATH)
  })

  test("removes CHVIEWER_DB_PATH when AG_EXPLORER_DB_PATH already present", () => {
    const dir = mkdtempSync(join(tmpdir(), "ag-explorer-env-"))
    const envPath = join(dir, ".env")
    writeFileSync(
      envPath,
      `${LEGACY_ENV_DB_PATH}=/tmp/old.sqlite\n${ENV_DB_PATH}=/tmp/new.sqlite\n`,
      "utf8",
    )

    delete process.env[LEGACY_ENV_DB_PATH]
    delete process.env[ENV_DB_PATH]

    loadEnvFile(envPath)

    expect(wasLegacyEnvRewritten()).toBe(false)
    expect(process.env[ENV_DB_PATH]).toBe("/tmp/new.sqlite")
    const text = readFileSync(envPath, "utf8")
    expect(text).toContain(`${ENV_DB_PATH}=/tmp/new.sqlite`)
    expect(text).not.toContain(LEGACY_ENV_DB_PATH)
  })
})
