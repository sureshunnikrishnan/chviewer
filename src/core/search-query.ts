import type { SearchFilters } from "./types"

const FILTER_KEYS = ["project", "session", "role", "event", "before", "after"] as const

type FilterKey = (typeof FILTER_KEYS)[number]

function tokenize(input: string): string[] {
  const tokens: string[] = []
  const pattern = /"([^"]+)"|'([^']+)'|(\S+)/g
  let match: RegExpExecArray | null

  while ((match = pattern.exec(input)) !== null) {
    tokens.push(match[1] ?? match[2] ?? match[3] ?? "")
  }

  return tokens
}

function parseDateValue(raw: string): number | undefined {
  const trimmed = raw.trim()
  if (!trimmed) return undefined

  if (/^\d+$/.test(trimmed)) {
    const numeric = Number(trimmed)
    return Number.isFinite(numeric) ? numeric : undefined
  }

  const parsed = Date.parse(trimmed)
  return Number.isNaN(parsed) ? undefined : parsed
}

function escapeFtsToken(token: string): string {
  return `"${token.replace(/"/g, '""')}"`
}

export function buildFtsQuery(terms: string[]): string {
  const cleaned = terms.map((term) => term.trim()).filter(Boolean)
  if (cleaned.length === 0) return ""
  return cleaned.map(escapeFtsToken).join(" ")
}

export function parseSearchQuery(query: string): { ftsQuery: string; filters: SearchFilters } {
  const filters: SearchFilters = {}
  const ftsTerms: string[] = []

  for (const token of tokenize(query)) {
    const colonIndex = token.indexOf(":")
    if (colonIndex > 0) {
      const key = token.slice(0, colonIndex).toLowerCase()
      const value = token.slice(colonIndex + 1).trim()
      if (FILTER_KEYS.includes(key as FilterKey) && value) {
        if (key === "before" || key === "after") {
          const parsed = parseDateValue(value)
          if (parsed !== undefined) filters[key] = parsed
        } else {
          filters[key as Exclude<FilterKey, "before" | "after">] = value
        }
        continue
      }
    }

    ftsTerms.push(token)
  }

  return {
    ftsQuery: buildFtsQuery(ftsTerms),
    filters,
  }
}

export function mergeSearchFilters(
  parsed: SearchFilters,
  cli: Partial<SearchFilters>,
): SearchFilters {
  return {
    ...parsed,
    ...Object.fromEntries(
      Object.entries(cli).filter(([, value]) => value !== undefined && value !== ""),
    ),
  }
}

export function parseCliDateFlag(value: string | undefined): number | undefined {
  if (!value) return undefined
  return parseDateValue(value)
}

export type EventFilterSpec = {
  sql: string
  params: unknown[]
}

export function eventFilterSpec(event: string | undefined): EventFilterSpec | null {
  if (!event) return null

  const normalized = event.trim().toLowerCase()
  switch (normalized) {
    case "user":
    case "prompt":
      return { sql: "e.kind = 'user_prompt'", params: [] }
    case "assistant":
    case "agent":
      return { sql: "e.kind = 'assistant_message'", params: [] }
    case "run":
    case "command":
      return { sql: "e.kind = 'command'", params: [] }
    case "error":
      return { sql: "e.kind = 'error'", params: [] }
    case "tool":
      return { sql: "e.kind = 'tool_call'", params: [] }
    case "read":
      return { sql: "e.kind = 'file_read'", params: [] }
    case "edit":
      return { sql: "e.kind = 'file_edit'", params: [] }
    case "search":
      return { sql: "e.kind = 'search'", params: [] }
    case "plan":
      return { sql: "e.kind = 'plan'", params: [] }
    case "unknown":
      return { sql: "e.kind = 'unknown'", params: [] }
    case "result":
    case "tool_result":
      return { sql: "e.kind = 'tool_result'", params: [] }
    default:
      return {
        sql: "e.kind = 'tool_call' AND json_extract(e.payload_json, '$.tool') = ?",
        params: [event],
      }
  }
}

export function roleFilterSpec(role: string | undefined): EventFilterSpec | null {
  if (!role) return null
  return { sql: "e.role = ?", params: [role] }
}

export function projectFilterSpec(project: string | undefined): EventFilterSpec | null {
  if (!project) return null
  return { sql: "p.name LIKE ? ESCAPE '\\'", params: [`%${escapeLike(project)}%`] }
}

export function sessionFilterSpec(session: string | undefined): EventFilterSpec | null {
  if (!session) return null
  if (/^\d+$/.test(session.trim())) {
    return { sql: "s.id = ?", params: [Number(session.trim())] }
  }
  return { sql: "s.title LIKE ? ESCAPE '\\'", params: [`%${escapeLike(session)}%`] }
}

function escapeLike(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_")
}

export function buildFilterClauses(filters: SearchFilters): {
  where: string[]
  params: unknown[]
} {
  const where: string[] = []
  const params: unknown[] = []

  const append = (spec: EventFilterSpec | null) => {
    if (!spec) return
    where.push(spec.sql)
    params.push(...spec.params)
  }

  append(projectFilterSpec(filters.project))
  append(sessionFilterSpec(filters.session))
  append(roleFilterSpec(filters.role))
  append(eventFilterSpec(filters.event))

  if (filters.before !== undefined) {
    where.push("s.updated_at <= ?")
    params.push(filters.before)
  }

  if (filters.after !== undefined) {
    where.push("s.updated_at >= ?")
    params.push(filters.after)
  }

  return { where, params }
}

export function truncateSnippet(text: string, max = 96): string {
  const flat = text.replace(/\s+/g, " ").trim()
  if (flat.length <= max) return flat
  return `${flat.slice(0, max - 1)}…`
}
