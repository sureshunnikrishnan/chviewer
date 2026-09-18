import { afterEach, describe, expect, test } from "bun:test"
import { mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { expandEnvValue, loadEnvFile } from "../src/env"

const savedEnv = { ...process.env }

afterEach(() => {
  process.env = { ...savedEnv }
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
    const dir = mkdtempSync(join(tmpdir(), "chviewer-env-"))
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
    const dir = mkdtempSync(join(tmpdir(), "chviewer-env-"))
    const envPath = join(dir, ".env")
    writeFileSync(envPath, "CURSOR_CHAT_HISTORY_DIR=~/fixture-projects\n", "utf8")

    delete process.env.CURSOR_CHAT_HISTORY_DIR
    loadEnvFile(envPath)

    expect(process.env.CURSOR_CHAT_HISTORY_DIR).toBe(
      join(process.env.HOME ?? "", "fixture-projects"),
    )
  })

  test("ignores missing file", () => {
    expect(() => loadEnvFile(join(tmpdir(), "missing-chviewer-env-file"))).not.toThrow()
  })
})
