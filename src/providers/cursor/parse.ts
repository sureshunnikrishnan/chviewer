import { readFile, stat } from "node:fs/promises"
import { basename, dirname } from "node:path"
import type { NormalizedEvent, ParsedSession } from "../../core/types"
import {
  PROVIDER,
  classifyToolResult,
  classifyToolUse,
  classifyTurnEnded,
  classifyUnknown,
} from "./classify"

type TranscriptContentPart = {
  type?: string
  text?: string
  name?: string
  input?: Record<string, unknown>
  result?: unknown
  content?: unknown
  output?: unknown
  is_error?: boolean
  [key: string]: unknown
}

type TranscriptEntry = {
  role?: string
  type?: string
  status?: string
  error?: string
  message?: {
    content?: TranscriptContentPart[] | string
  }
}

export function extractText(content: TranscriptContentPart[] | string | undefined): string {
  if (!content) return ""
  if (typeof content === "string") return content.trim()

  return content
    .filter((part) => part?.type === "text" && typeof part.text === "string")
    .map((part) => part.text!.trim())
    .filter(Boolean)
    .join("\n")
    .trim()
}

export function extractUserQuery(text: string): string {
  const match = text.match(/<user_query>\s*([\s\S]*?)\s*<\/user_query>/i)
  if (match?.[1]) return match[1].trim()

  return text
    .replace(/<timestamp>[\s\S]*?<\/timestamp>/gi, "")
    .replace(/<\/?[a-zA-Z_:][\w:.-]*>/g, "")
    .trim()
}

function oneLine(text: string, max = 72): string {
  const flat = text.replace(/\s+/g, " ").trim()
  if (flat.length <= max) return flat
  return `${flat.slice(0, max - 1)}…`
}

function messageKind(role: string | null): NormalizedEvent["kind"] {
  return role === "user" ? "user_prompt" : "assistant_message"
}

function normalizeMessageEvent(
  text: string,
  role: string | null,
  source_offset: number,
): NormalizedEvent {
  let normalizedText = text
  if (role === "user") normalizedText = extractUserQuery(text)

  return {
    kind: messageKind(role),
    role,
    text: normalizedText,
    payload: { provider: PROVIDER },
    source_offset,
    timestamp: null,
  }
}

function normalizeToolEvent(
  toolPart: TranscriptContentPart,
  role: string | null,
  source_offset: number,
): NormalizedEvent {
  const toolName = toolPart.name ?? "unknown"
  const input =
    toolPart.input && typeof toolPart.input === "object" && !Array.isArray(toolPart.input)
      ? toolPart.input
      : {}

  const classified = classifyToolUse(toolName, input)

  return {
    kind: classified.kind,
    role,
    text: "",
    payload: classified.payload,
    source_offset,
    timestamp: null,
  }
}

function normalizeToolResultEvent(
  resultPart: TranscriptContentPart,
  role: string | null,
  source_offset: number,
): NormalizedEvent {
  const classified = classifyToolResult(resultPart as Record<string, unknown>)

  return {
    kind: classified.kind,
    role,
    text: "",
    payload: classified.payload,
    source_offset,
    timestamp: null,
  }
}

function normalizeTurnEnded(entry: TranscriptEntry, source_offset: number): NormalizedEvent {
  const classified = classifyTurnEnded({
    status: entry.status,
    error: entry.error,
  })

  return {
    kind: classified.kind,
    role: entry.role ?? null,
    text: "",
    payload: classified.payload,
    source_offset,
    timestamp: null,
  }
}

function normalizeUnknown(entry: TranscriptEntry, source_offset: number): NormalizedEvent {
  const classified = classifyUnknown(entry as Record<string, unknown>)

  return {
    kind: classified.kind,
    role: entry.role ?? null,
    text: "",
    payload: classified.payload,
    source_offset,
    timestamp: null,
  }
}

function normalizeEntry(entry: TranscriptEntry, source_offset: number): NormalizedEvent[] {
  if (entry.type === "turn_ended" || entry.role === "turn_ended") {
    return [normalizeTurnEnded(entry, source_offset)]
  }

  const role = entry.role ?? null
  const content = entry.message?.content
  const textParts = extractText(content)
  const contentParts = Array.isArray(content) ? content : []
  const toolParts = contentParts.filter((part) => part?.type === "tool_use")
  const resultParts = contentParts.filter((part) => part?.type === "tool_result")

  const events: NormalizedEvent[] = []

  if (textParts) {
    events.push(normalizeMessageEvent(textParts, role, source_offset))
  }

  for (const toolPart of toolParts) {
    events.push(normalizeToolEvent(toolPart, role, source_offset))
  }

  for (const resultPart of resultParts) {
    events.push(normalizeToolResultEvent(resultPart, role, source_offset))
  }

  if (events.length > 0) return events

  return [normalizeUnknown(entry, source_offset)]
}

export function parseSessionContent(
  raw: string,
  source_mtime: number,
  fallbackTitle: string,
): ParsedSession {
  const events: NormalizedEvent[] = []
  let title = fallbackTitle
  let offset = 0

  while (offset < raw.length) {
    const nextNewline = raw.indexOf("\n", offset)
    const lineEnd = nextNewline === -1 ? raw.length : nextNewline
    const line = raw.slice(offset, lineEnd)
    const source_offset = offset
    const hasNewline = nextNewline !== -1

    offset = hasNewline ? nextNewline + 1 : raw.length

    if (!line.trim()) continue

    let entry: TranscriptEntry
    try {
      entry = JSON.parse(line) as TranscriptEntry
    } catch {
      if (!hasNewline) continue
      continue
    }

    const normalized = normalizeEntry(entry, source_offset)
    for (const event of normalized) {
      events.push(event)

      if (
        title === fallbackTitle &&
        event.kind === "user_prompt" &&
        event.role === "user" &&
        event.text
      ) {
        title = oneLine(event.text)
      }
    }
  }

  return {
    title,
    started_at: source_mtime,
    updated_at: source_mtime,
    events,
  }
}

export async function parseSessionFile(source_path: string): Promise<ParsedSession> {
  const info = await stat(source_path)
  const raw = await readFile(source_path, "utf8")
  const id = basename(dirname(source_path))
  const fallbackTitle = id.slice(0, 8)

  const parsed = parseSessionContent(raw, info.mtimeMs, fallbackTitle)
  parsed.started_at = info.birthtimeMs || info.mtimeMs
  parsed.updated_at = info.mtimeMs
  return parsed
}
