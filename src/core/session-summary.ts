import type { AgentEvent } from "./agent-session"
import { isTimelineVisible } from "./agent-session"

export type SessionSummary = {
  filesRead: number
  filesEdited: number
  commandsRun: number
  failedCommands: number
  toolCalls: number
}

export function sessionSummary(events: AgentEvent[]): SessionSummary {
  const summary: SessionSummary = {
    filesRead: 0,
    filesEdited: 0,
    commandsRun: 0,
    failedCommands: 0,
    toolCalls: 0,
  }

  for (const event of events) {
    if (!isTimelineVisible(event)) continue

    switch (event.type) {
      case "file_read":
        summary.filesRead++
        break
      case "file_edit":
        summary.filesEdited++
        break
      case "command":
        summary.commandsRun++
        if (event.exitCode !== undefined && event.exitCode !== 0) {
          summary.failedCommands++
        }
        break
      case "tool_call":
      case "tool_result":
      case "search":
        summary.toolCalls++
        break
      default:
        break
    }
  }

  return summary
}

export function formatSessionSummaryLine(summary: SessionSummary): string {
  return `Read ${summary.filesRead} · Edited ${summary.filesEdited} · Run ${summary.commandsRun} · Failed ${summary.failedCommands} · Tools ${summary.toolCalls}`
}
