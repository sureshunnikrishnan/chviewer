import { readFile, stat } from "node:fs/promises"
import { basename } from "node:path"
import type { NormalizedEvent, ParsedSession } from "../../core/types"
import {
  classifyToolResult,
  classifyToolUse,
  classifyTurnEnded,
  classifyUnknown,
} from "./classify"
import { CLAUDE_CODE_PROVIDER_ID } from "./paths"

type ContentPart = {
  type?: string
  text?: string
  name?: string
  input?: Record<string, unknown>
  result?: unknown
  content?: unknown
  output?: unknown
  is_error?: boolean
  isError?: boolean
  [key: string]: unknown
}

type TranscriptEntry = {
  role?: string
  type?: string
  status?: string
  error?: string
  message?: {
    role?: string
    content?: ContentPart[] | string
  }
  content?: ContentPart[] | string
}

function oneLine(text: string, max = 72): string {
  const flat = text.replace(/\s+/g, " ").trim()
  if (flat.length <= max) return flat
  return `${flat.slice(0, max - 1)}…`
}

function extractText(content: ContentPart[] | string | undefined): string {
  if (!content) return ""
  if (typeof content === "string") return content.trim()

  return content
    .filter((part) => part?.type === "text" && typeof part.text === "string")
    .map((part) => part.text!.trim())
    .filter(Boolean)
    .join("\n")
    .trim()
}

function entryRole(entry: TranscriptEntry): string | null {
  return entry.role ?? entry.message?.role ?? entry.type ?? null
}

function entryContent(entry: TranscriptEntry): ContentPart[] | string | undefined {
  if (entry.message?.content !== undefined) return entry.message.content
  if (entry.content !== undefined) return entry.content
  return undefined
}

function messageKind(role: string | null): NormalizedEvent["kind"] {
  if (role === "user" || role === "human") return "user_prompt"
  if (role === "assistant") return "assistant_message"
  return "assistant_message"
}

function normalizeMessageEvent(
  text: string,
  role: string | null,
  source_offset: number,
): NormalizedEvent {
  return {
    kind: messageKind(role),
    role,
    text,
    payload: { provider: CLAUDE_CODE_PROVIDER_ID },
    source_offset,
    timestamp: null,
  }
}

function normalizeToolEvent(
  toolPart: ContentPart,
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
  resultPart: ContentPart,
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
    role: entryRole(entry),
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
    role: entryRole(entry),
    text: "",
    payload: classified.payload,
    source_offset,
    timestamp: null,
  }
}

function isTurnEnded(entry: TranscriptEntry): boolean {
  return entry.type === "turn_ended" || entry.role === "turn_ended"
}

function normalizeEntry(entry: TranscriptEntry, source_offset: number): NormalizedEvent[] {
  if (isTurnEnded(entry)) {
    return [normalizeTurnEnded(entry, source_offset)]
  }

  const role = entryRole(entry)
  const content = entryContent(entry)
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
  titleHint?: string,
): ParsedSession {
  const events: NormalizedEvent[] = []
  let title = titleHint?.trim() ? oneLine(titleHint) : fallbackTitle
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

export async function parseSessionFile(
  sourcePath: string,
  titleHint?: string,
): Promise<ParsedSession> {
  const info = await stat(sourcePath)
  const raw = await readFile(sourcePath, "utf8")
  const id = basename(sourcePath, ".jsonl")
  const fallbackTitle = id.slice(0, 8)

  const parsed = parseSessionContent(raw, info.mtimeMs, fallbackTitle, titleHint)
  parsed.started_at = info.birthtimeMs || info.mtimeMs
  parsed.updated_at = info.mtimeMs
  return parsed
}
