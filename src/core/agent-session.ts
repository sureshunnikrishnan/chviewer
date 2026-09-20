export type TimelineLabel =
  | "USER"
  | "AGENT"
  | "PLAN"
  | "READ"
  | "EDIT"
  | "RUN"
  | "SEARCH"
  | "ERROR"
  | "TOOL"
  | "UNK"

export type ProjectRef = {
  id: number
  name: string
}

export type PlanRef = {
  paths: string[]
  name?: string
}

export type AgentEventBase = {
  id: number
  seq: number
  label: TimelineLabel
  summary: string
}

export type UserPromptEvent = AgentEventBase & {
  type: "user_prompt"
  text: string
}

export type AssistantMessageEvent = AgentEventBase & {
  type: "assistant_message"
  text: string
}

export type PlanEvent = AgentEventBase & {
  type: "plan"
  name: string
  path?: string
  overview?: string
  todos?: unknown
}

export type FileReadEvent = AgentEventBase & {
  type: "file_read"
  path: string
  offset?: number
  limit?: number
}

export type FileEditEvent = AgentEventBase & {
  type: "file_edit"
  path: string
  editKind: "Write" | "StrReplace" | "Delete"
  oldText?: string
  newText?: string
  contents?: string
}

export type CommandEvent = AgentEventBase & {
  type: "command"
  command: string
  description?: string
  workingDirectory?: string
  exitCode?: number
}

export type SearchEvent = AgentEventBase & {
  type: "search"
  searchKind: "grep" | "glob"
  pattern?: string
  glob?: string
  path?: string
  headLimit?: number
}

export type ErrorEvent = AgentEventBase & {
  type: "error"
  status: string
  message: string
}

export type TurnEndedEvent = AgentEventBase & {
  type: "turn_ended"
  status?: string
}

export type ToolCallEvent = AgentEventBase & {
  type: "tool_call"
  tool: string
  input: Record<string, unknown>
}

export type ToolResultEvent = AgentEventBase & {
  type: "tool_result"
  tool?: string
  payload: Record<string, unknown>
}

export type UnknownEvent = AgentEventBase & {
  type: "unknown"
  original: Record<string, unknown>
}

export type AgentEvent =
  | UserPromptEvent
  | AssistantMessageEvent
  | PlanEvent
  | FileReadEvent
  | FileEditEvent
  | CommandEvent
  | SearchEvent
  | ErrorEvent
  | TurnEndedEvent
  | ToolCallEvent
  | ToolResultEvent
  | UnknownEvent

export type AgentSession = {
  id: number
  title: string
  project: ProjectRef
  startedAt?: Date
  updatedAt?: Date
  source: "cursor"
  events: AgentEvent[]
  plan?: PlanRef
}

export function isTimelineVisible(event: AgentEvent): boolean {
  return event.type !== "turn_ended"
}

export function timelineEvents(session: AgentSession): AgentEvent[] {
  return session.events.filter(isTimelineVisible)
}
