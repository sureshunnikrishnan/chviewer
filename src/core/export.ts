import type { AgentEvent, AgentSession } from "./agent-session"
import { isTimelineVisible } from "./agent-session"
import { formatSessionSummaryLine, sessionSummary } from "./session-summary"
import { formatEventDetailPlain } from "../ui/event-detail"
import { formatTimelineEventName } from "../ui/timeline"

function formatTimelineLinePlain(event: AgentEvent): string {
  return formatTimelineEventName(event)
}

export function formatSessionPlain(session: AgentSession): string {
  const parts = [`# ${session.title}`, `Project: ${session.project.name}`, ""]
  parts.push(formatSessionSummaryLine(sessionSummary(session.events)), "")

  if (session.plan?.paths.length) {
    parts.push("## Plan")
    for (const path of session.plan.paths) parts.push(path)
    parts.push("")
  }

  parts.push("## Session Timeline", "")

  for (const event of session.events.filter(isTimelineVisible)) {
    parts.push(formatTimelineLinePlain(event))
    parts.push(formatEventDetailPlain(event))
    parts.push("")
  }

  return parts.join("\n").trimEnd() + "\n"
}

export function formatEventPlain(event: AgentEvent): string {
  return `${formatTimelineLinePlain(event)}\n\n${formatEventDetailPlain(event)}`
}

export function formatSessionJson(session: AgentSession): string {
  return `${JSON.stringify(
    {
      id: session.id,
      title: session.title,
      project: session.project,
      startedAt: session.startedAt?.toISOString() ?? null,
      updatedAt: session.updatedAt?.toISOString() ?? null,
      source: session.source,
      plan: session.plan ?? null,
      events: session.events,
    },
    null,
    2,
  )}\n`
}
