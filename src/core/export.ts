import type { AgentEvent, AgentSession } from "./agent-session"
import { isTimelineVisible } from "./agent-session"
import type { KnowledgeItem } from "./knowledge"
import { formatKnowledgeListPlain } from "./knowledge"
import {
  formatSessionIntelligence,
  formatSessionOutcome,
  sessionIntelligence,
  sessionOutcome,
} from "./session-intelligence"
import { formatSessionFilesSection } from "./session-files"
import { formatSessionSummaryLine, sessionSummary } from "./session-summary"
import { formatEventDetailPlain } from "../ui/event-detail"
import { formatTimelineEventName } from "../ui/timeline"

function formatTimelineLinePlain(event: AgentEvent): string {
  return formatTimelineEventName(event)
}

export function formatSessionPlain(
  session: AgentSession,
  extras?: { knowledge?: KnowledgeItem[] },
): string {
  const parts = [`# ${session.title}`, `Project: ${session.project.name}`, ""]
  parts.push(formatSessionSummaryLine(sessionSummary(session.events)), "")
  parts.push(formatSessionOutcome(sessionOutcome(session)), "")
  parts.push(formatSessionIntelligence(sessionIntelligence(session)), "")

  if (extras?.knowledge?.length) {
    parts.push("## Knowledge", formatKnowledgeListPlain(extras.knowledge), "")
  }

  const filesSection = formatSessionFilesSection(session.files)
  if (filesSection) parts.push(filesSection)

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

export function formatSessionJson(
  session: AgentSession,
  extras?: Record<string, unknown> & { knowledge?: KnowledgeItem[] },
): string {
  const { knowledge, ...rest } = extras ?? {}
  return `${JSON.stringify(
    {
      id: session.id,
      title: session.title,
      project: session.project,
      startedAt: session.startedAt?.toISOString() ?? null,
      updatedAt: session.updatedAt?.toISOString() ?? null,
      source: session.source,
      sourcePath: session.sourcePath,
      intelligence: sessionIntelligence(session),
      outcome: sessionOutcome(session),
      knowledge: knowledge ?? [],
      files: session.files,
      plan: session.plan ?? null,
      events: session.events,
      ...rest,
    },
    null,
    2,
  )}\n`
}
