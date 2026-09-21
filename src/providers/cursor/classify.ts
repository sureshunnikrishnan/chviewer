import type { EventKind } from "../../core/types"

export const PROVIDER = "cursor"

type ToolInput = Record<string, unknown>

function baseToolPayload(toolName: string, input: ToolInput): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    provider: PROVIDER,
    tool: toolName,
    input,
  }

  if (typeof input.command === "string") {
    payload.command = input.command
  }

  return payload
}

export function classifyToolUse(
  toolName: string,
  input: ToolInput,
): { kind: EventKind; payload: Record<string, unknown> } {
  const base = baseToolPayload(toolName, input)

  switch (toolName) {
    case "CreatePlan":
      return {
        kind: "plan",
        payload: {
          ...base,
          name: input.name,
          path: input.path,
          overview: input.overview,
          todos: input.todos,
        },
      }

    case "Read":
      return {
        kind: "file_read",
        payload: {
          ...base,
          path: input.path,
          offset: input.offset,
          limit: input.limit,
        },
      }

    case "Write":
    case "StrReplace":
      return {
        kind: "file_edit",
        payload: {
          ...base,
          path: input.path,
          editKind: toolName === "Write" ? "Write" : "StrReplace",
          oldText: input.old_string,
          newText: input.new_string,
          contents: input.contents,
        },
      }

    case "Delete":
      return {
        kind: "file_edit",
        payload: {
          ...base,
          path: input.path,
          editKind: "Delete",
        },
      }

    case "Shell":
      return {
        kind: "command",
        payload: {
          ...base,
          command: input.command,
          description: input.description,
          workingDirectory: input.working_directory,
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
          path: input.path,
          glob: input.glob,
          headLimit: input.head_limit,
        },
      }

    case "Glob":
      return {
        kind: "search",
        payload: {
          ...base,
          searchKind: "glob",
          glob: input.glob_pattern,
          path: input.target_directory,
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
      provider: PROVIDER,
      tool: part.name,
      result: part.result ?? part.content ?? part.output,
      isError: part.is_error,
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
        provider: PROVIDER,
        status,
        message: typeof entry.error === "string" ? entry.error : status,
      },
    }
  }

  return {
    kind: "turn_ended",
    payload: {
      provider: PROVIDER,
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
      provider: PROVIDER,
      original,
    },
  }
}
