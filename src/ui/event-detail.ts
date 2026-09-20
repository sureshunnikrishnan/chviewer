import type { AgentEvent, FileEditEvent } from "../core/agent-session"

const CONTENTS_PREVIEW_LINES = 20
const EMPTY_EDIT_NOTICE = "Edit contents not recorded in transcript."

function diffOldPath(path: string): string {
  if (path.startsWith("/dev/")) return path
  return path.startsWith("/") ? `a${path}` : `a/${path}`
}

function diffNewPath(path: string): string {
  if (path.startsWith("/dev/")) return path
  return path.startsWith("/") ? `b${path}` : `b/${path}`
}

export function formatFileEditHeader(event: FileEditEvent): string {
  return [`Path: ${event.path}`, `Kind: ${event.editKind}`].join("\n")
}

export function formatFileEditUnifiedDiff(event: FileEditEvent): string | null {
  if (event.editKind === "Delete") return null

  if (event.editKind === "StrReplace") {
    const oldText = event.oldText ?? ""
    const newText = event.newText ?? ""
    if (!oldText && !newText) return null

    const oldLines = oldText ? oldText.split("\n") : []
    const newLines = newText ? newText.split("\n") : []
    const oldCount = oldLines.length
    const newCount = newLines.length

    return [
      `--- ${diffOldPath(event.path)}`,
      `+++ ${diffNewPath(event.path)}`,
      `@@ -1,${oldCount} +1,${newCount} @@`,
      ...oldLines.map((line) => `-${line}`),
      ...newLines.map((line) => `+${line}`),
    ].join("\n")
  }

  if (event.editKind === "Write") {
    const contents = event.contents ?? ""
    if (!contents) return null

    const contentLines = contents.split("\n")
    const previewLines = contentLines.slice(0, CONTENTS_PREVIEW_LINES)
    const truncated = contentLines.length > CONTENTS_PREVIEW_LINES

    const lines = [
      "--- /dev/null",
      `+++ ${diffNewPath(event.path)}`,
      `@@ -0,0 +1,${previewLines.length + (truncated ? 1 : 0)} @@`,
      ...previewLines.map((line) => `+${line}`),
    ]
    if (truncated) {
      lines.push(`+# … (${contentLines.length - CONTENTS_PREVIEW_LINES} more lines)`)
    }
    return lines.join("\n")
  }

  return null
}

export function formatEventDetailPlain(event: AgentEvent): string {
  switch (event.type) {
    case "user_prompt":
    case "assistant_message":
      return event.text

    case "plan": {
      const lines = [`Plan: ${event.name}`]
      if (event.path) lines.push(`Path: ${event.path}`)
      if (event.overview) lines.push(`Overview: ${event.overview}`)
      if (event.todos !== undefined) {
        lines.push("", "Todos:")
        lines.push(JSON.stringify(event.todos, null, 2))
      }
      return lines.join("\n")
    }

    case "file_read": {
      const lines = [`Path: ${event.path}`]
      if (event.offset !== undefined) lines.push(`Offset: ${event.offset}`)
      if (event.limit !== undefined) lines.push(`Limit: ${event.limit}`)
      return lines.join("\n")
    }

    case "file_edit": {
      const lines = [formatFileEditHeader(event)]
      lines.push("Inside file edit event")
      if (event.editKind === "Delete") {
        return lines.join("\n")
      }

      const diff = formatFileEditUnifiedDiff(event)
      if (diff) {
        lines.push("", diff)
      } else {
        lines.push("", EMPTY_EDIT_NOTICE)
      }
      return lines.join("\n")
    }

    case "command": {
      const lines = ["Command", "──────────────────", event.command]
      if (event.description) lines.push(`Description: ${event.description}`)
      if (event.workingDirectory) lines.push(`Working directory: ${event.workingDirectory}`)
      if (event.exitCode !== undefined) {
        lines.push(`Exit code: ${event.exitCode}`)
      } else {
        lines.push("", "Output and exit code are not recorded in Cursor transcripts.")
      }
      return lines.join("\n")
    }

    case "search": {
      if (event.searchKind === "glob") {
        const lines = [`Glob: ${event.glob ?? ""}`]
        if (event.path) lines.push(`Directory: ${event.path}`)
        return lines.join("\n")
      }
      const lines = [`Pattern: ${event.pattern ?? ""}`]
      if (event.path) lines.push(`Path: ${event.path}`)
      if (event.glob) lines.push(`Glob filter: ${event.glob}`)
      if (event.headLimit !== undefined) lines.push(`Head limit: ${event.headLimit}`)
      return lines.join("\n")
    }

    case "error": {
      return [`Status: ${event.status}`, event.message].join("\n")
    }

    case "tool_call":
      return JSON.stringify({ tool: event.tool, input: event.input }, null, 2)

    case "tool_result":
      return JSON.stringify(event.payload, null, 2)

    case "unknown":
      return JSON.stringify(event.original, null, 2)

    case "turn_ended":
      return event.status ? `Turn ended (${event.status})` : "Turn ended"
  }
}
