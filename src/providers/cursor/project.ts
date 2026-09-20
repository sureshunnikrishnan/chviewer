import { basename } from "node:path"
import type {
  AgentEvent,
  AssistantMessageEvent,
  CommandEvent,
  ErrorEvent,
  FileEditEvent,
  FileReadEvent,
  PlanEvent,
  SearchEvent,
  ToolCallEvent,
  ToolResultEvent,
  TurnEndedEvent,
  UnknownEvent,
  UserPromptEvent,
} from "../../core/agent-session"
import type { StoredEvent } from "../../core/types"

function oneLine(text: string, max = 72): string {
  const flat = text.replace(/\s+/g, " ").trim()
  if (flat.length <= max) return flat
  return `${flat.slice(0, max - 1)}…`
}

function relPath(path: string): string {
  const home = process.env.HOME ?? ""
  if (home && path.startsWith(home)) {
    return path.slice(home.length + 1)
  }
  return path
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" ? value : undefined
}

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>
  }
  return {}
}

function baseEvent(event: StoredEvent): { id: number; seq: number; summary: string } {
  return { id: event.id, seq: event.seq, summary: "" }
}

function mapUserPrompt(event: StoredEvent): UserPromptEvent | null {
  if (!event.text.trim()) return null
  return {
    ...baseEvent(event),
    type: "user_prompt",
    label: "USER",
    summary: oneLine(event.text),
    text: event.text,
  }
}

function mapAssistantMessage(event: StoredEvent): AssistantMessageEvent | null {
  if (!event.text.trim()) return null
  return {
    ...baseEvent(event),
    type: "assistant_message",
    label: "AGENT",
    summary: oneLine(event.text),
    text: event.text,
  }
}

function mapPlan(event: StoredEvent): PlanEvent {
  const p = event.payload
  const name = asString(p.name) ?? "Plan"
  return {
    ...baseEvent(event),
    type: "plan",
    label: "PLAN",
    summary: oneLine(name.replace(/\.plan\.md$/i, "")),
    name,
    path: asString(p.path),
    overview: asString(p.overview),
    todos: p.todos,
  }
}

function mapFileRead(event: StoredEvent): FileReadEvent {
  const p = event.payload
  const path = asString(p.path) ?? "unknown"
  return {
    ...baseEvent(event),
    type: "file_read",
    label: "READ",
    summary: relPath(path),
    path,
    offset: asNumber(p.offset),
    limit: asNumber(p.limit),
  }
}

function mapFileEdit(event: StoredEvent): FileEditEvent {
  const p = event.payload
  const input = asRecord(p.input)
  const path = asString(p.path) ?? asString(input.path) ?? "unknown"
  const editKindRaw = asString(p.editKind)
  const editKind =
    editKindRaw === "Write" || editKindRaw === "Delete" || editKindRaw === "StrReplace"
      ? editKindRaw
      : "StrReplace"

  return {
    ...baseEvent(event),
    type: "file_edit",
    label: "EDIT",
    summary: relPath(path),
    path,
    editKind,
    oldText: asString(p.oldText) ?? asString(input.old_string),
    newText: asString(p.newText) ?? asString(input.new_string),
    contents: asString(p.contents) ?? asString(input.contents),
  }
}

function mapCommand(event: StoredEvent): CommandEvent {
  const p = event.payload
  const input = asRecord(p.input)
  const command =
    asString(p.command) ?? asString(input.command) ?? "command"

  return {
    ...baseEvent(event),
    type: "command",
    label: "RUN",
    summary: oneLine(command, 60),
    command,
    description: asString(p.description) ?? asString(input.description),
    workingDirectory: asString(p.workingDirectory) ?? asString(input.working_directory),
    exitCode: asNumber(p.exitCode) ?? asNumber(input.exit_code),
  }
}

function mapSearch(event: StoredEvent): SearchEvent {
  const p = event.payload
  const searchKind = asString(p.searchKind) === "glob" ? "glob" : "grep"

  if (searchKind === "glob") {
    const glob = asString(p.glob) ?? "glob"
    return {
      ...baseEvent(event),
      type: "search",
      label: "SEARCH",
      summary: oneLine(glob, 60),
      searchKind: "glob",
      glob,
      path: asString(p.path),
    }
  }

  const pattern = asString(p.pattern) ?? "search"
  return {
    ...baseEvent(event),
    type: "search",
    label: "SEARCH",
    summary: oneLine(pattern, 60),
    searchKind: "grep",
    pattern,
    path: asString(p.path),
    glob: asString(p.glob),
    headLimit: asNumber(p.headLimit),
  }
}

function mapToolCall(event: StoredEvent): ToolCallEvent {
  const p = event.payload
  const tool = asString(p.tool) ?? "unknown"
  return {
    ...baseEvent(event),
    type: "tool_call",
    label: "TOOL",
    summary: tool,
    tool,
    input: asRecord(p.input),
  }
}

function mapToolResult(event: StoredEvent): ToolResultEvent {
  const p = event.payload
  const tool = asString(p.tool)
  const summary = tool ?? "tool result"
  return {
    ...baseEvent(event),
    type: "tool_result",
    label: "TOOL",
    summary,
    tool,
    payload: p,
  }
}

function mapError(event: StoredEvent): ErrorEvent {
  const p = event.payload
  const status = asString(p.status) ?? "error"
  const message = asString(p.message) ?? status
  return {
    ...baseEvent(event),
    type: "error",
    label: "ERROR",
    summary: oneLine(message, 60),
    status,
    message,
  }
}

function mapTurnEnded(event: StoredEvent): TurnEndedEvent {
  const status = asString(event.payload.status)
  return {
    ...baseEvent(event),
    type: "turn_ended",
    label: "TOOL",
    summary: status ?? "turn ended",
    status,
  }
}

function mapUnknown(event: StoredEvent): UnknownEvent {
  const original = asRecord(event.payload.original)
  const typeHint = asString(original.type) ?? "unknown"
  return {
    ...baseEvent(event),
    type: "unknown",
    label: "UNK",
    summary: oneLine(typeHint, 60),
    original,
  }
}

function mapStoredEvent(event: StoredEvent): AgentEvent | null {
  switch (event.kind) {
    case "user_prompt":
      return mapUserPrompt(event)
    case "assistant_message":
      return mapAssistantMessage(event)
    case "plan":
      return mapPlan(event)
    case "file_read":
      return mapFileRead(event)
    case "file_edit":
      return mapFileEdit(event)
    case "command":
      return mapCommand(event)
    case "search":
      return mapSearch(event)
    case "tool_call":
      return mapToolCall(event)
    case "tool_result":
      return mapToolResult(event)
    case "error":
      return mapError(event)
    case "turn_ended":
      return mapTurnEnded(event)
    case "unknown":
      return mapUnknown(event)
    default:
      return null
  }
}

export function projectCursorEvents(events: StoredEvent[]): AgentEvent[] {
  const projected: AgentEvent[] = []

  for (const event of events) {
    const mapped = mapStoredEvent(event)
    if (mapped) projected.push(mapped)
  }

  return projected
}

export function resolvePlanFromEvents(
  events: AgentEvent[],
  planPaths: string[],
): { paths: string[]; name?: string } | undefined {
  if (planPaths.length === 0) return undefined

  const planEvent = events.find((event): event is PlanEvent => event.type === "plan")
  return {
    paths: planPaths,
    name: planEvent?.name ?? basename(planPaths[0] ?? "plan"),
  }
}
