import { describe, expect, test } from "bun:test"
import { allProviders, getProvider, tryGetProvider } from "../../src/providers/registry"

describe("provider registry", () => {
  test("lists cursor and claude-code providers", () => {
    const ids = allProviders().map((provider) => provider.id)
    expect(ids).toContain("cursor")
    expect(ids).toContain("claude-code")
  })

  test("getProvider returns known providers", () => {
    expect(getProvider("cursor").capabilities.plans).toBe(true)
    expect(getProvider("claude-code").capabilities.plans).toBe(false)
  })

  test("getProvider throws for unknown id", () => {
    expect(() => getProvider("codex")).toThrow("Unknown session provider")
  })

  test("tryGetProvider returns undefined for unknown id", () => {
    expect(tryGetProvider("codex")).toBeUndefined()
  })
})
