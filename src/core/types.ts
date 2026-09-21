export type EventKind =
  | "user_prompt"
  | "assistant_message"
  | "plan"
  | "file_read"
  | "file_edit"
  | "command"
  | "search"
  | "tool_call"
  | "tool_result"
  | "error"
  | "turn_ended"
  | "unknown"

export type NormalizedEvent = {
  kind: EventKind
  role: string | null
  text: string
  payload: Record<string, unknown>
  source_offset: number
  timestamp: number | null
}

export type StoredEvent = NormalizedEvent & {
  id: number
  seq: number
}

export type ParsedSession = {
  title: string
  started_at: number | null
  updated_at: number
  events: NormalizedEvent[]
}

export type DiscoveredSession = {
  source_path: string
  source_mtime: number
  source_size: number
}

export type DiscoveredProject = {
  provider: string
  name: string
  source_path: string
  sessions: DiscoveredSession[]
}

export type Project = {
  id: number
  name: string
  provider: string
  sessionCount: number
  lastSessionAt: number
}

export type Session = {
  id: number
  projectId: number
  title: string
  startedAt: number | null
  updatedAt: number
  eventCount: number
  sourceProvider: string
}

export type SearchHit = {
  eventId: number
  seq: number
  snippet: string
}

export type SearchResultGroup = {
  projectId: number
  projectName: string
  sessionId: number
  sessionTitle: string
  matchCount: number
  hits: SearchHit[]
}

export type SearchFilters = {
  project?: string
  session?: string
  role?: string
  event?: string
  provider?: string
  before?: number
  after?: number
}

export type Message = {
  role: string
  text: string
}

export type SessionTranscript = {
  messages: Message[]
  planPaths: string[]
}

export type IndexSummary = {
  projectsAdded: number
  projectsUpdated: number
  projectsRemoved: number
  sessionsAdded: number
  sessionsUpdated: number
  sessionsRemoved: number
  sessionsSkipped: number
  eventsIndexed: number
}
