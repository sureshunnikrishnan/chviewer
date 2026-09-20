import { describe, expect, test } from "bun:test"
import {
  buildFtsQuery,
  eventFilterSpec,
  mergeSearchFilters,
  parseSearchQuery,
} from "../../src/core/search-query"

describe("parseSearchQuery", () => {
  test("extracts inline filters and fts terms", () => {
    const parsed = parseSearchQuery('project:demo JWT role:user "refresh token"')
    expect(parsed.filters.project).toBe("demo")
    expect(parsed.filters.role).toBe("user")
    expect(parsed.ftsQuery).toBe('"JWT" "refresh token"')
  })

  test("parses before and after dates", () => {
    const parsed = parseSearchQuery("before:2026-01-01 after:2025-12-01 redis")
    expect(parsed.filters.before).toBe(Date.parse("2026-01-01"))
    expect(parsed.filters.after).toBe(Date.parse("2025-12-01"))
    expect(parsed.ftsQuery).toBe('"redis"')
  })
})

describe("mergeSearchFilters", () => {
  test("cli flags override parsed tokens", () => {
    const merged = mergeSearchFilters({ project: "demo" }, { project: "backend" })
    expect(merged.project).toBe("backend")
  })
})

describe("buildFtsQuery", () => {
  test("quotes and joins terms", () => {
    expect(buildFtsQuery(["demo", "app"])).toBe('"demo" "app"')
  })
})

describe("eventFilterSpec", () => {
  test("maps run to command kind", () => {
    expect(eventFilterSpec("run")?.sql).toBe("e.kind = 'command'")
  })

  test("maps user prompts to user_prompt kind", () => {
    expect(eventFilterSpec("user")?.sql).toBe("e.kind = 'user_prompt'")
  })

  test("maps error to error kind", () => {
    expect(eventFilterSpec("error")?.sql).toBe("e.kind = 'error'")
  })
})
