import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { parseSessionContent } from "../../../src/providers/claude-code/parse"
import { FIXTURE_CLAUDE_PROJECTS } from "../../helpers"

const fixtureDir = join(
  FIXTURE_CLAUDE_PROJECTS,
  "-Users-fixtureuser-workspace-projects-demo",
)

describe("claude-code parse", () => {
  test("parses user, assistant, read, and bash tools", () => {
    const raw = readFileSync(join(fixtureDir, "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.jsonl"), "utf8")
    const parsed = parseSessionContent(raw, 1_700_000_000_000, "fallback", "Fix the login bug")

    expect(parsed.title).toBe("Fix the login bug")
    expect(parsed.events.map((event) => event.kind)).toEqual([
      "user_prompt",
      "assistant_message",
      "file_read",
      "tool_result",
      "command",
    ])
    expect(parsed.events[2]?.payload.path).toBe("src/auth.ts")
    expect(parsed.events[4]?.payload.command).toBe("pnpm test auth")
  })

  test("parses grep and skips malformed lines", () => {
    const raw = readFileSync(join(fixtureDir, "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb.jsonl"), "utf8")
    const parsed = parseSessionContent(raw, 1_700_000_000_000, "fallback", "Find JWT usage")

    expect(parsed.title).toBe("Find JWT usage")
    expect(parsed.events.map((event) => event.kind)).toEqual([
      "user_prompt",
      "search",
    ])
    expect(parsed.events[1]?.payload.pattern).toBe("JWT")
  })
})
