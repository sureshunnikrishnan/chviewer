import { describe, expect, test } from "bun:test"
import { join } from "node:path"
import { formatConversationDate, formatMessagesPlain } from "../../src/core/format"
import { FIXTURE_PLANS } from "../helpers"

describe("formatConversationDate", () => {
  test("returns unknown for zero timestamp", () => {
    expect(formatConversationDate(0)).toBe("unknown")
  })

  test("formats a valid timestamp", () => {
    const formatted = formatConversationDate(Date.UTC(2026, 0, 15, 12, 30))
    expect(formatted).toContain("2026")
  })
})

describe("formatMessagesPlain", () => {
  test("includes plan paths and role labels", () => {
    const plain = formatMessagesPlain(
      [
        { role: "user", text: "Hello" },
        { role: "assistant", text: "Hi there" },
      ],
      "Demo chat",
      [join(FIXTURE_PLANS, "demo_plan_abcd1234.plan.md")],
    )

    expect(plain).toContain("# Demo chat")
    expect(plain).toContain("## Plan")
    expect(plain).toContain("demo_plan_abcd1234.plan.md")
    expect(plain).toContain("[you]")
    expect(plain).toContain("[agent]")
  })
})
