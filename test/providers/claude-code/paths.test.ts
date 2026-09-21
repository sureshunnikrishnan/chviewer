import { describe, expect, test } from "bun:test"
import { formatProjectName } from "../../../src/providers/claude-code/paths"

describe("claude-code paths", () => {
  test("formatProjectName mirrors Cursor workspace shortening", () => {
    expect(formatProjectName("-Users-fixtureuser-workspace-projects-demo")).toBe("projects-demo")
  })
})
