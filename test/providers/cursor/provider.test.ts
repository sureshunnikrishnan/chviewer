import { describe, expect, test } from "bun:test"
import { cursorProvider } from "../../../src/providers/cursor/index"

describe("cursor SessionProvider", () => {
  test("declares full capabilities", () => {
    expect(cursorProvider.id).toBe("cursor")
    expect(cursorProvider.capabilities).toEqual({
      toolCalls: true,
      fileChanges: true,
      commands: true,
      plans: true,
    })
  })

  test("resolvePlans is defined", () => {
    expect(cursorProvider.resolvePlans).toBeDefined()
  })
})
