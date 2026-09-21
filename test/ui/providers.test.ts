import { describe, expect, test } from "bun:test"
import { formatProviderHeaderLine } from "../../src/ui/providers"

describe("formatProviderHeaderLine", () => {
  test("highlights active provider with brackets", () => {
    const line = formatProviderHeaderLine("cursor", [
      { id: "cursor", label: "Cursor" },
      { id: "claude-code", label: "Claude Code" },
    ])
    expect(line).toBe("[Cursor] · Claude Code")
  })

  test("shows empty-state message when none configured", () => {
    expect(formatProviderHeaderLine("", [])).toBe("No providers configured in .env")
  })
})
