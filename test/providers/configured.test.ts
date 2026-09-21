import { afterEach, describe, expect, test } from "bun:test"
import { mkdirSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { loadEnvFile, resetLegacyEnvRewrittenForTests } from "../../src/core/env"
import {
  isProviderConfigured,
  listConfiguredProviders,
  parseEnvFileKeys,
} from "../../src/providers/configured"

const savedEnv = { ...process.env }
const tempDirs: string[] = []

afterEach(() => {
  process.env = { ...savedEnv }
  resetLegacyEnvRewrittenForTests()
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true })
  }
})

function writeEnv(dir: string, content: string): string {
  tempDirs.push(dir)
  mkdirSync(dir, { recursive: true })
  const filePath = join(dir, ".env")
  writeFileSync(filePath, content, "utf8")
  return filePath
}

describe("configured providers", () => {
  test("parseEnvFileKeys ignores commented lines", () => {
    const dir = join(tmpdir(), `ag-explorer-env-keys-${Date.now()}`)
    const filePath = writeEnv(
      dir,
      `# CLAUDE_PROJECTS_DIR=$HOME/.claude/projects
CURSOR_CHAT_HISTORY_DIR=$HOME/.cursor/projects
`,
    )

    const keys = parseEnvFileKeys(filePath)
    expect(keys.has("CURSOR_CHAT_HISTORY_DIR")).toBe(true)
    expect(keys.has("CLAUDE_PROJECTS_DIR")).toBe(false)
  })

  test("listConfiguredProviders reads active keys from env file", () => {
    const dir = join(tmpdir(), `ag-explorer-configured-${Date.now()}`)
    const filePath = writeEnv(
      dir,
      `CURSOR_CHAT_HISTORY_DIR=$HOME/.cursor/projects
CLAUDE_PROJECTS_DIR=$HOME/.claude/projects
`,
    )

    loadEnvFile(filePath)

    const providers = listConfiguredProviders()
    expect(providers.map((provider) => provider.id)).toEqual(["cursor", "claude-code"])
    expect(isProviderConfigured("cursor")).toBe(true)
    expect(isProviderConfigured("claude-code")).toBe(true)
  })

  test("falls back to process.env when env file is missing", () => {
    resetLegacyEnvRewrittenForTests()
    delete process.env.CURSOR_CHAT_HISTORY_DIR
    delete process.env.AGENT_TRANSCRIPTS
    delete process.env.CLAUDE_PROJECTS_DIR
    delete process.env.CLAUDE_CONFIG_DIR

    const dir = join(tmpdir(), `ag-explorer-missing-env-${Date.now()}`)
    tempDirs.push(dir)
    process.env.CURSOR_CHAT_HISTORY_DIR = "/tmp/cursor-projects"

    loadEnvFile(join(dir, "missing.env"))

    expect(listConfiguredProviders().map((provider) => provider.id)).toEqual(["cursor"])
  })
})
