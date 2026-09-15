import { open, readdir, readFile, stat } from "node:fs/promises"
import { homedir } from "node:os"
import { basename, dirname, join } from "node:path"
import { StyledText, bold, dim, fg, t } from "@opentui/core"
import { expandEnvValue } from "./env"
import { theme } from "./theme"

const ENV_CHAT_HISTORY_DIR = "CURSOR_CHAT_HISTORY_DIR"
const ENV_AGENT_TRANSCRIPTS = "AGENT_TRANSCRIPTS"
const ENV_PLANS_DIR = "CURSOR_PLANS_DIR"

export type ChatMessage = {
  role: string
  text: string
}

export type ChatSummary = {
  id: string
  title: string
  path: string
  mtimeMs: number
}

export type ChatDetails = {
  messages: ChatMessage[]
  planPaths: string[]
}

export type WorkspaceSummary = {
  id: string
  name: string
  slug: string
  transcriptsDir: string
  chatCount: number
  lastConversationAt: number
}

type TranscriptContentPart = {
  type?: string
  text?: string
  name?: string
  input?: {
    name?: string
    path?: string
    [key: string]: unknown
  }
}

type TranscriptEntry = {
  role?: string
  message?: {
    content?: TranscriptContentPart[] | string
  }
}

export function resolveChatHistoryDir(): string {
  const fromEnv = process.env[ENV_CHAT_HISTORY_DIR]?.trim()
  if (fromEnv) return expandEnvValue(fromEnv)

  const agentTranscripts = process.env[ENV_AGENT_TRANSCRIPTS]?.trim()
  if (agentTranscripts) {
    // .../<workspace>/agent-transcripts → .../projects
    return dirname(dirname(expandEnvValue(agentTranscripts)))
  }

  return join(homedir(), ".cursor", "projects")
}

export function resolvePlansDir(): string {
  const fromEnv = process.env[ENV_PLANS_DIR]?.trim()
  if (fromEnv) return expandEnvValue(fromEnv)
  return join(homedir(), ".cursor", "plans")
}

/**
 * Complete workspace name without the Cursor "workspace-" prefix.
 * Users-<user>-workspace-projects-chviewer → projects-chviewer
 */
export function formatWorkspaceName(slug: string): string {
  let name = slug.replace(/^Users-[^-]+-/, "")
  name = name.replace(/^workspace-/, "")
  return name || slug
}

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

function extractText(content: TranscriptContentPart[] | string | undefined): string {
  if (!content) return ""
  if (typeof content === "string") return content.trim()

  return content
    .filter((part) => part?.type === "text" && typeof part.text === "string")
    .map((part) => part.text!.trim())
    .filter(Boolean)
    .join("\n")
    .trim()
}

function extractUserQuery(text: string): string {
  const match = text.match(/<user_query>\s*([\s\S]*?)\s*<\/user_query>/i)
  if (match?.[1]) return match[1].trim()

  return text
    .replace(/<timestamp>[\s\S]*?<\/timestamp>/gi, "")
    .replace(/<\/?[a-zA-Z_:][\w:.-]*>/g, "")
    .trim()
}

async function readFileHead(path: string, maxBytes: number): Promise<string> {
  const handle = await open(path, "r")
  try {
    const buffer = Buffer.alloc(maxBytes)
    const { bytesRead } = await handle.read(buffer, 0, maxBytes, 0)
    return buffer.subarray(0, bytesRead).toString("utf8")
  } finally {
    await handle.close()
  }
}

function oneLine(text: string, max = 72): string {
  const flat = text.replace(/\s+/g, " ").trim()
  if (flat.length <= max) return flat
  return `${flat.slice(0, max - 1)}…`
}

function normalizePlanKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/\.plan\.md$/i, "")
    .replace(/_[a-f0-9]{8}$/i, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
}

function isPlanFilePath(value: string): boolean {
  return (
    value.endsWith(".plan.md") &&
    !value.includes("*") &&
    (value.startsWith("/") || value.startsWith("~"))
  )
}

async function listPlanFiles(plansDir: string): Promise<string[]> {
  try {
    const entries = await readdir(plansDir)
    return entries
      .filter((name) => name.endsWith(".plan.md"))
      .map((name) => join(plansDir, name))
  } catch {
    return []
  }
}

function resolvePlanNamesToPaths(names: string[], planFiles: string[]): string[] {
  const paths: string[] = []
  for (const name of names) {
    const key = normalizePlanKey(name)
    if (!key) continue
    for (const file of planFiles) {
      if (normalizePlanKey(basename(file)) === key) paths.push(file)
    }
  }
  return paths
}

function collectPlanRefsFromContent(
  content: TranscriptContentPart[] | string | undefined,
  planPaths: Set<string>,
  planNames: Set<string>,
): void {
  if (!content) return
  const blob = typeof content === "string" ? content : JSON.stringify(content)

  for (const match of blob.matchAll(/(?:~|\/)[^\s"'<>\\]+?\.plan\.md/g)) {
    const path = match[0]
    if (isPlanFilePath(path)) planPaths.add(expandEnvValue(path))
  }

  if (!Array.isArray(content)) return

  for (const part of content) {
    if (part?.type === "tool_use" && part.name === "CreatePlan") {
      const planName = part.input?.name
      if (typeof planName === "string" && planName.trim()) {
        planNames.add(planName.trim())
      }
    }

    const inputPath = part?.input?.path
    if (typeof inputPath === "string" && isPlanFilePath(inputPath)) {
      planPaths.add(expandEnvValue(inputPath))
    }
  }
}

type ChatFileInfo = { path: string; mtimeMs: number }

async function listChatFiles(transcriptsDir: string): Promise<ChatFileInfo[]> {
  let entries
  try {
    entries = await readdir(transcriptsDir, { withFileTypes: true })
  } catch {
    return []
  }

  const files: ChatFileInfo[] = []
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const candidate = join(transcriptsDir, entry.name, `${entry.name}.jsonl`)
    try {
      const info = await stat(candidate)
      if (info.isFile()) files.push({ path: candidate, mtimeMs: info.mtimeMs })
    } catch {
      // skip missing/invalid chat folders
    }
  }
  return files
}

export async function loadWorkspaces(historyDir: string): Promise<WorkspaceSummary[]> {
  let entries
  try {
    entries = await readdir(historyDir, { withFileTypes: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(
      `Cannot read chat history directory (${ENV_CHAT_HISTORY_DIR}=${historyDir}): ${message}`,
    )
  }

  const workspaces: WorkspaceSummary[] = []

  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    if (entry.name.startsWith(".")) continue

    const transcriptsDir = join(historyDir, entry.name, "agent-transcripts")
    const chatFiles = await listChatFiles(transcriptsDir)
    if (chatFiles.length === 0) continue

    const lastConversationAt = chatFiles.reduce(
      (max, file) => Math.max(max, file.mtimeMs),
      0,
    )

    workspaces.push({
      id: entry.name,
      slug: entry.name,
      name: formatWorkspaceName(entry.name),
      transcriptsDir,
      chatCount: chatFiles.length,
      lastConversationAt,
    })
  }

  workspaces.sort((a, b) => b.lastConversationAt - a.lastConversationAt)
  return workspaces
}

export async function loadChats(workspace: WorkspaceSummary): Promise<ChatSummary[]> {
  const files = await listChatFiles(workspace.transcriptsDir)
  const chats: ChatSummary[] = []

  for (const file of files) {
    const id = basename(file.path, ".jsonl")
    let title = id.slice(0, 8)

    try {
      const raw = await readFileHead(file.path, 64_000)
      for (const line of raw.split("\n")) {
        if (!line.trim()) continue
        let entry: TranscriptEntry
        try {
          entry = JSON.parse(line) as TranscriptEntry
        } catch {
          continue
        }
        if (entry.role !== "user") continue
        const text = extractUserQuery(extractText(entry.message?.content))
        if (text) {
          title = oneLine(text)
          break
        }
      }
    } catch {
      // keep fallback title
    }

    chats.push({ id, title, path: file.path, mtimeMs: file.mtimeMs })
  }

  chats.sort((a, b) => b.mtimeMs - a.mtimeMs)
  return chats
}

export async function loadChatDetails(chatPath: string): Promise<ChatDetails> {
  const raw = await readFile(chatPath, "utf8")
  const messages: ChatMessage[] = []
  const planPaths = new Set<string>()
  const planNames = new Set<string>()

  for (const line of raw.split("\n")) {
    if (!line.trim()) continue
    let entry: TranscriptEntry
    try {
      entry = JSON.parse(line) as TranscriptEntry
    } catch {
      continue
    }

    collectPlanRefsFromContent(entry.message?.content, planPaths, planNames)

    const role = entry.role ?? "unknown"
    if (role === "turn_ended") continue

    let text = extractText(entry.message?.content)
    if (role === "user") text = extractUserQuery(text)
    if (!text) continue

    messages.push({ role, text })
  }

  if (planNames.size > 0) {
    const planFiles = await listPlanFiles(resolvePlansDir())
    for (const path of resolvePlanNamesToPaths([...planNames], planFiles)) {
      planPaths.add(path)
    }
  }

  return {
    messages,
    planPaths: [...planPaths].sort(),
  }
}

export async function loadChatMessages(chatPath: string): Promise<ChatMessage[]> {
  const details = await loadChatDetails(chatPath)
  return details.messages
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
  messages: ChatMessage[],
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
  messages: ChatMessage[],
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
