import type { EventKind } from "../../core/types"
import { CLAUDE_CODE_PROVIDER_ID } from "./paths"

type ToolInput = Record<string, unknown>

function pickPath(input: ToolInput): string | undefined {
  const candidates = [input.path, input.file_path, input.filePath, input.notebook_path]
  for (const value of candidates) {
    if (typeof value === "string" && value.trim()) return value
  }
  return undefined
}

function pickCommand(input: ToolInput): string | undefined {
  const candidates = [input.command, input.cmd]
  for (const value of candidates) {
    if (typeof value === "string" && value.trim()) return value
  }
  return undefined
}

function baseToolPayload(toolName: string, input: ToolInput): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    provider: CLAUDE_CODE_PROVIDER_ID,
    tool: toolName,
    input,
  }

  const command = pickCommand(input)
  if (command) payload.command = command

  return payload
}

export function classifyToolUse(
  toolName: string,
  input: ToolInput,
): { kind: EventKind; payload: Record<string, unknown> } {
  const base = baseToolPayload(toolName, input)
  const path = pickPath(input)

  switch (toolName) {
    case "Read":
    case "NotebookRead":
      return {
        kind: "file_read",
        payload: {
          ...base,
          path,
          offset: input.offset,
          limit: input.limit,
        },
      }

    case "Write":
    case "Edit":
    case "MultiEdit":
    case "NotebookEdit":
      return {
        kind: "file_edit",
        payload: {
          ...base,
          path,
          editKind: toolName === "Write" || toolName === "NotebookEdit" ? "Write" : "StrReplace",
          oldText: input.old_string ?? input.old_str,
          newText: input.new_string ?? input.new_str,
          contents: input.contents ?? input.content,
        },
      }

    case "Delete":
      return {
        kind: "file_edit",
        payload: {
          ...base,
          path,
          editKind: "Delete",
        },
      }

    case "Bash":
    case "Shell":
      return {
        kind: "command",
        payload: {
          ...base,
          command: pickCommand(input),
          description: input.description,
          workingDirectory: input.working_directory ?? input.cwd,
          ...(input.exit_code !== undefined ? { exitCode: input.exit_code } : {}),
        },
      }

    case "Grep":
      return {
        kind: "search",
        payload: {
          ...base,
          searchKind: "grep",
          pattern: input.pattern,
          path: pickPath(input),
          glob: input.glob ?? input.include,
          headLimit: input.head_limit,
        },
      }

    case "Glob":
      return {
        kind: "search",
        payload: {
          ...base,
          searchKind: "glob",
          glob: input.glob_pattern ?? input.pattern,
          path: input.target_directory ?? pickPath(input),
        },
      }

    default:
      return { kind: "tool_call", payload: base }
  }
}

export function classifyToolResult(
  part: Record<string, unknown>,
): { kind: EventKind; payload: Record<string, unknown> } {
  return {
    kind: "tool_result",
    payload: {
      provider: CLAUDE_CODE_PROVIDER_ID,
      tool: part.name ?? part.tool,
      result: part.result ?? part.content ?? part.output,
      isError: part.is_error ?? part.isError,
      part,
    },
  }
}

export function classifyTurnEnded(entry: {
  status?: string
  error?: string
}): { kind: EventKind; payload: Record<string, unknown> } {
  const status = typeof entry.status === "string" ? entry.status : "unknown"

  if (status === "error" || typeof entry.error === "string") {
    return {
      kind: "error",
      payload: {
        provider: CLAUDE_CODE_PROVIDER_ID,
        status,
        message: typeof entry.error === "string" ? entry.error : status,
      },
    }
  }

  return {
    kind: "turn_ended",
    payload: {
      provider: CLAUDE_CODE_PROVIDER_ID,
      status,
    },
  }
}

export function classifyUnknown(
  original: Record<string, unknown>,
): { kind: EventKind; payload: Record<string, unknown> } {
  return {
    kind: "unknown",
    payload: {
      provider: CLAUDE_CODE_PROVIDER_ID,
      original,
    },
  }
}
