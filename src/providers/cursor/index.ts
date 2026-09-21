import type { PlanRef } from "../../core/agent-session"
import type { StoredEvent } from "../../core/types"
import { discoverCursorProjectList, discoverCursorSessions } from "./discover"
import { parseSessionFile } from "./parse"
import { resolvePlanPathsFromPayloads } from "./plans"
import { projectCursorEvents, resolvePlanFromEvents } from "./project"
import type { ProviderProject, ProviderSessionSummary, SessionProvider } from "../types"

async function resolvePlans(events: StoredEvent[]): Promise<PlanRef | undefined> {
  const planPaths = await resolvePlanPathsFromPayloads(events.map((event) => event.payload))
  const projected = projectCursorEvents(events)
  return resolvePlanFromEvents(projected, planPaths)
}

export const cursorProvider: SessionProvider = {
  id: "cursor",
  capabilities: {
    toolCalls: true,
    fileChanges: true,
    commands: true,
    plans: true,
  },
  discoverProjects: discoverCursorProjectList,
  discoverSessions: discoverCursorSessions,
  loadSession: (session) => parseSessionFile(session.sourcePath),
  projectEvents: projectCursorEvents,
  resolvePlans,
}

export type { ProviderProject, ProviderSessionSummary }
