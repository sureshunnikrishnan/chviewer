import { StyledText, bold, dim, fg, t } from "@opentui/core"
import type { AgentEvent } from "../core/agent-session"
import { isTimelineVisible } from "../core/agent-session"
import type { ProviderCapabilities } from "../providers/types"
import { formatEventDetailPlain } from "./event-detail"
import { theme } from "./theme"

export type TimelineCategory =
  | "all"
  | "messages"
  | "files"
  | "commands"
  | "errors"
  | "tools"
  | "plans"

export const TIMELINE_CATEGORIES: TimelineCategory[] = [
  "all",
  "messages",
  "files",
  "commands",
  "errors",
  "tools",
  "plans",
]

export const CATEGORY_BY_KEY: Record<string, TimelineCategory> = {
  "0": "all",
  "1": "messages",
  "2": "files",
  "3": "commands",
  "4": "errors",
  "5": "tools",
  "6": "plans",
}

function labelColor(label: AgentEvent["label"]): string {
  switch (label) {
    case "USER":
      return theme.userLabel
    case "AGENT":
      return theme.agentLabel
    case "PLAN":
      return theme.otherLabel
    case "READ":
    case "SEARCH":
      return theme.footerText
    case "EDIT":
      return theme.userText
    case "RUN":
      return theme.agentText
    case "ERROR":
      return theme.userLabel
    case "UNK":
      return theme.otherLabel
    default:
      return theme.muted
  }
}

export function isErrorEvent(event: AgentEvent): boolean {
  if (event.type === "error") return true
  if (event.type === "command" && event.exitCode !== undefined && event.exitCode !== 0) {
    return true
  }
  return false
}

export function eventMatchesCategory(event: AgentEvent, category: TimelineCategory): boolean {
  if (category === "all") return true

  switch (category) {
    case "messages":
      return event.type === "user_prompt" || event.type === "assistant_message"
    case "files":
      return event.type === "file_read" || event.type === "file_edit"
    case "commands":
      return event.type === "command"
    case "errors":
      return isErrorEvent(event)
    case "tools":
      return (
        event.type === "tool_call" ||
        event.type === "tool_result" ||
        event.type === "search" ||
        event.type === "unknown"
      )
    case "plans":
      return event.type === "plan"
    default:
      return true
  }
}

export function filterTimelineEventsByCategory(
  events: AgentEvent[],
  category: TimelineCategory,
): AgentEvent[] {
  const visible = events.filter(isTimelineVisible)
  if (category === "all") return visible
  return visible.filter((event) => eventMatchesCategory(event, category))
}

export function formatTimelineEventSummary(event: AgentEvent): string {
  if (event.type === "command" && event.exitCode === 0) {
    return `${event.summary} ✓`
  }
  return event.summary
}

export function formatTimelineEventName(event: AgentEvent): string {
  return `${event.label}  ${formatTimelineEventSummary(event)}`
}

export function availableTimelineCategories(
  capabilities?: ProviderCapabilities,
): TimelineCategory[] {
  if (!capabilities || capabilities.plans) return TIMELINE_CATEGORIES
  return TIMELINE_CATEGORIES.filter((category) => category !== "plans")
}

export function formatCategoryFilterLine(
  active: TimelineCategory,
  categories: TimelineCategory[] = TIMELINE_CATEGORIES,
): string {
  return categories
    .map((category) => (category === active ? `[${category}]` : category))
    .join(" · ")
}

export function categoryFilterKeys(categories: TimelineCategory[]): Record<string, TimelineCategory> {
  const keys: Record<string, TimelineCategory> = {}
  for (const [key, category] of Object.entries(CATEGORY_BY_KEY)) {
    if (categories.includes(category)) keys[key] = category
  }
  return keys
}

export function formatTimelineLine(event: AgentEvent, showArrow = true): StyledText {
  const color = labelColor(event.label)
  const arrow = showArrow ? dim(fg(theme.muted)("  ↓")) : ""
  return new StyledText([
    ...t`${bold(fg(color)(event.label.padEnd(6)))}${fg(theme.textBright)(formatTimelineEventSummary(event))}`.chunks,
    ...(showArrow ? t`${arrow}`.chunks : []),
    ...t`\n`.chunks,
  ])
}

export function formatTimeline(events: AgentEvent[], filter = "", category: TimelineCategory = "all"): StyledText {
  const visible = filterTimelineEvents(events, filter, category)
  if (visible.length === 0) {
    const empty =
      filter.trim() || category !== "all" ? "(no events match filter)" : "(empty session)"
    return new StyledText([...t`${dim(fg(theme.muted)(empty))}`.chunks])
  }

  const chunks = visible.flatMap((event, index) =>
    formatTimelineLine(event, index < visible.length - 1).chunks,
  )
  return new StyledText(chunks)
}

export function filterTimelineEvents(
  events: AgentEvent[],
  needle: string,
  category: TimelineCategory = "all",
): AgentEvent[] {
  const byCategory = filterTimelineEventsByCategory(events, category)
  const q = needle.trim().toLowerCase()
  if (!q) return byCategory

  return byCategory.filter((event) => {
    const haystack = [
      event.label,
      event.summary,
      formatEventDetailPlain(event),
      event.type,
    ]
      .join("\n")
      .toLowerCase()
    return haystack.includes(q)
  })
}

export function formatTimelinePlain(events: AgentEvent[]): string {
  return events
    .filter(isTimelineVisible)
    .map((event) => formatTimelineEventName(event))
    .join("\n")
}
