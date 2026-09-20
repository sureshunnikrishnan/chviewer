import type { NormalizedEvent } from "./types"

const SEARCHABLE_INPUT_KEYS = [
  "path",
  "command",
  "pattern",
  "glob_pattern",
  "query",
  "name",
  "overview",
  "old_string",
  "new_string",
  "contents",
  "description",
  "url",
  "search_term",
] as const

function truncate(value: string, max = 500): string {
  if (value.length <= max) return value
  return `${value.slice(0, max - 1)}…`
}

function collectStringValues(value: unknown, out: string[], depth = 0): void {
  if (depth > 4) return

  if (typeof value === "string") {
    const trimmed = value.trim()
    if (trimmed) out.push(trimmed)
    return
  }

  if (Array.isArray(value)) {
    for (const item of value) collectStringValues(item, out, depth + 1)
    return
  }

  if (value && typeof value === "object") {
    for (const entry of Object.values(value as Record<string, unknown>)) {
      collectStringValues(entry, out, depth + 1)
    }
  }
}

function payloadInputStrings(payload: Record<string, unknown>): string[] {
  const strings: string[] = []
  const input = payload.input
  if (input && typeof input === "object" && !Array.isArray(input)) {
    for (const key of SEARCHABLE_INPUT_KEYS) {
      const value = (input as Record<string, unknown>)[key]
      if (typeof value === "string" && value.trim()) {
        strings.push(truncate(value.trim()))
      }
    }
  }
  return strings
}

function structuredSearchText(payload: Record<string, unknown>): string {
  const parts: string[] = []

  if (typeof payload.tool === "string" && payload.tool.trim()) {
    parts.push(payload.tool.trim())
  }

  if (typeof payload.command === "string" && payload.command.trim()) {
    parts.push(payload.command.trim())
  }

  if (typeof payload.name === "string" && payload.name.trim()) {
    parts.push(payload.name.trim())
  }

  if (typeof payload.path === "string" && payload.path.trim()) {
    parts.push(payload.path.trim())
  }

  if (typeof payload.pattern === "string" && payload.pattern.trim()) {
    parts.push(payload.pattern.trim())
  }

  if (typeof payload.glob === "string" && payload.glob.trim()) {
    parts.push(payload.glob.trim())
  }

  if (typeof payload.overview === "string" && payload.overview.trim()) {
    parts.push(truncate(payload.overview.trim()))
  }

  parts.push(...payloadInputStrings(payload))

  return parts.join("\n")
}

function errorSearchText(payload: Record<string, unknown>): string {
  const parts: string[] = []

  if (typeof payload.status === "string" && payload.status.trim()) {
    parts.push(payload.status.trim())
  }

  if (typeof payload.message === "string" && payload.message.trim()) {
    parts.push(payload.message.trim())
  }

  collectStringValues(payload, parts)
  return parts.join("\n")
}

function turnEndedSearchText(payload: Record<string, unknown>): string {
  const parts: string[] = []

  if (typeof payload.status === "string" && payload.status.trim()) {
    parts.push(payload.status.trim())
  }

  collectStringValues(payload, parts)
  return parts.join("\n")
}

function unknownSearchText(payload: Record<string, unknown>): string {
  const parts: string[] = []
  collectStringValues(payload.original, parts)
  collectStringValues(payload, parts)
  return parts.join("\n")
}

export function searchableText(event: NormalizedEvent): string {
  switch (event.kind) {
    case "user_prompt":
    case "assistant_message":
      return event.text
    case "plan":
    case "file_read":
    case "file_edit":
    case "command":
    case "search":
    case "tool_call":
      return structuredSearchText(event.payload)
    case "tool_result":
      return structuredSearchText(event.payload)
    case "error":
      return errorSearchText(event.payload)
    case "turn_ended":
      return turnEndedSearchText(event.payload)
    case "unknown":
      return unknownSearchText(event.payload)
    default:
      return event.text.trim() || structuredSearchText(event.payload)
  }
}
