import { StyledText, bold, dim, fg, t } from "@opentui/core"
import { theme } from "../ui/theme"
import type { Message } from "./types"

export function formatConversationDate(mtimeMs: number): string {
  if (!mtimeMs) return "unknown"
  const date = new Date(mtimeMs)
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function partyColors(role: string): { label: string; body: string; name: string } {
  if (role === "user") {
    return { label: theme.userLabel, body: theme.userText, name: "you" }
  }
  if (role === "assistant") {
    return { label: theme.agentLabel, body: theme.agentText, name: "agent" }
  }
  return { label: theme.otherLabel, body: theme.otherText, name: role }
}

export function formatMessagesPlain(
  messages: Message[],
  title = "Transcript",
  planPaths: string[] = [],
): string {
  const parts = [`# ${title}`, ""]
  if (planPaths.length > 0) {
    parts.push("## Plan")
    for (const path of planPaths) parts.push(path)
    parts.push("")
  }

  for (const msg of messages) {
    const label = msg.role === "user" ? "you" : msg.role === "assistant" ? "agent" : msg.role
    parts.push(`[${label}]`, msg.text, "")
  }

  return parts.join("\n").trimEnd() + "\n"
}

export function formatMessages(
  messages: Message[],
  filter = "",
  title = "Transcript",
  planPaths: string[] = [],
): StyledText {
  const needle = filter.trim().toLowerCase()
  const filtered = needle
    ? messages.filter(
        (msg) =>
          msg.role.toLowerCase().includes(needle) ||
          msg.text.toLowerCase().includes(needle),
      )
    : messages

  const chunks = [...t`${bold(fg(theme.title)(title))}\n`.chunks]

  if (planPaths.length > 0) {
    chunks.push(...t`\n${bold(fg(theme.agentLabel)("Plan"))}\n`.chunks)
    for (const path of planPaths) {
      chunks.push(...t`${fg(theme.userLabel)(path)}\n`.chunks)
    }
  }

  chunks.push(...t`\n`.chunks)

  if (filtered.length === 0) {
    const empty = needle ? "(no messages match filter)" : "(empty chat)"
    chunks.push(...t`${dim(fg(theme.muted)(empty))}`.chunks)
    return new StyledText(chunks)
  }

  filtered.forEach((msg, index) => {
    const colors = partyColors(msg.role)
    const body = msg.text.length > 4000 ? `${msg.text.slice(0, 4000)}…` : msg.text
    chunks.push(
      ...t`${bold(fg(colors.label)(`[${colors.name}]`))}\n${fg(colors.body)(body)}`.chunks,
    )
    if (index < filtered.length - 1) {
      chunks.push(...t`\n\n${dim(fg(theme.divider)("────────────────────────────────"))}\n\n`.chunks)
    }
  })

  return new StyledText(chunks)
}
