import type { PlanRef } from "../core/agent-session"
import type { AgentEvent } from "../core/agent-session"
import type { ParsedSession, StoredEvent } from "../core/types"

export type ProviderCapabilities = {
  toolCalls: boolean
  fileChanges: boolean
  commands: boolean
  plans: boolean
}

export type ProviderProject = {
  id: string
  name: string
  sourcePath: string
}

export type ProviderSessionSummary = {
  sourcePath: string
  sourceMtime: number
  sourceSize: number
  titleHint?: string
}

export interface SessionProvider {
  readonly id: string
  readonly capabilities: ProviderCapabilities
  discoverProjects(): Promise<ProviderProject[]>
  discoverSessions(project: ProviderProject): Promise<ProviderSessionSummary[]>
  loadSession(session: ProviderSessionSummary): Promise<ParsedSession>
  projectEvents(events: StoredEvent[]): AgentEvent[]
  resolvePlans?(events: StoredEvent[]): Promise<PlanRef | undefined>
}
