import { readdir, readFile } from "node:fs/promises"
import { homedir } from "node:os"
import { basename, join } from "node:path"
import { expandEnvValue } from "./env"

const ENV_PLANS_DIR = "CURSOR_PLANS_DIR"

export type PlanTodo = {
  id: string
  content: string
  status: string
}

export type ChatPlan = {
  name: string
  overview: string
  path?: string
  body: string
  todos: PlanTodo[]
}

type TranscriptPart = {
  type?: string
  name?: string
  text?: string
  input?: {
    name?: string
    overview?: string
    plan?: string
  }
}

type TranscriptEntry = {
  role?: string
  message?: {
    content?: TranscriptPart[] | string
  }
}

export function resolvePlansDir(): string {
  const fromEnv = process.env[ENV_PLANS_DIR]?.trim()
  if (fromEnv) return expandEnvValue(fromEnv)
  return join(homedir(), ".cursor", "plans")
}

function slugifyPlanName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
}

function parseFrontmatter(raw: string): {
  name?: string
  overview?: string
  todos: PlanTodo[]
  body: string
} {
  if (!raw.startsWith("---")) {
    return { todos: [], body: raw.trim() }
  }

  const end = raw.indexOf("\n---", 3)
  if (end === -1) return { todos: [], body: raw.trim() }

  const fm = raw.slice(3, end).trim()
  const body = raw.slice(end + 4).trim()

  let name: string | undefined
  let overview: string | undefined
  const todos: PlanTodo[] = []

  const nameMatch = fm.match(/^name:\s*(.+)$/m)
  if (nameMatch) name = nameMatch[1].trim().replace(/^["']|["']$/g, "")

  const overviewMatch = fm.match(/^overview:\s*(.+)$/m)
  if (overviewMatch) {
    overview = overviewMatch[1].trim().replace(/^["']|["']$/g, "")
  }

  // Parse simple YAML todo list items
  const todoBlocks = fm.split(/\n\s*-\s+id:\s*/).slice(1)
  for (const block of todoBlocks) {
    const id = block.match(/^([^\n]+)/)?.[1]?.trim()
    const content = block.match(/\n\s*content:\s*(.+)/)?.[1]?.trim()?.replace(/^["']|["']$/g, "")
    const status = block.match(/\n\s*status:\s*(.+)/)?.[1]?.trim() ?? "pending"
    if (id && content) todos.push({ id, content, status })
  }

  return { name, overview, todos, body }
}

async function loadPlanFile(path: string): Promise<ChatPlan | null> {
  try {
    const raw = await readFile(path, "utf8")
    const parsed = parseFrontmatter(raw)
    return {
      name: parsed.name ?? basename(path, ".plan.md"),
      overview: parsed.overview ?? "",
      path,
      body: parsed.body,
      todos: parsed.todos,
    }
  } catch {
    return null
  }
}

async function findPlanByName(plansDir: string, name: string): Promise<string | null> {
  const slug = slugifyPlanName(name)
  if (!slug) return null

  let entries: string[]
  try {
    entries = await readdir(plansDir)
  } catch {
    return null
  }

  const match = entries.find(
    (file) =>
      file.endsWith(".plan.md") &&
      (file.startsWith(`${slug}_`) || file === `${slug}.plan.md`),
  )
  return match ? join(plansDir, match) : null
}

function collectPlanPaths(text: string): string[] {
  const paths = new Set<string>()
  const re = /(?:^|[\s"'`=(])((?:\/|\.\/|~\/)[^\s"'`<>]+\.plan\.md)/g
  for (const match of text.matchAll(re)) {
    paths.add(expandEnvValue(match[1]))
  }
  return [...paths]
}

/** Quick check used while listing chats (title scan already reads file head). */
export function transcriptMentionsPlan(raw: string): boolean {
  return raw.includes("CreatePlan") || raw.includes(".plan.md")
}

/**
 * Resolve a plan associated with a chat transcript, if any.
 * Prefers on-disk `.plan.md` files; falls back to inline CreatePlan payload.
 */
export async function loadAssociatedPlan(
  chatPath: string,
  plansDir = resolvePlansDir(),
): Promise<ChatPlan | null> {
  const raw = await readFile(chatPath, "utf8")
  const planPaths = collectPlanPaths(raw)

  for (const path of planPaths) {
    const plan = await loadPlanFile(path)
    if (plan) return plan
  }

  let inline: ChatPlan | null = null

  for (const line of raw.split("\n")) {
    if (!line.trim()) continue
    let entry: TranscriptEntry
    try {
      entry = JSON.parse(line) as TranscriptEntry
    } catch {
      continue
    }

    const content = entry.message?.content
    if (!Array.isArray(content)) continue

    for (const part of content) {
      if (part.type === "tool_use" && part.name === "CreatePlan" && part.input) {
        const name = part.input.name?.trim() || "Plan"
        const overview = part.input.overview?.trim() || ""
        const body = part.input.plan?.trim() || ""

        const diskPath = await findPlanByName(plansDir, name)
        if (diskPath) {
          const fromDisk = await loadPlanFile(diskPath)
          if (fromDisk) return fromDisk
        }

        inline = { name, overview, body, todos: [] }
      }
    }
  }

  return inline
}

export function formatPlanPlainText(plan: ChatPlan): string {
  const lines = [`## Plan: ${plan.name}`]
  if (plan.path) lines.push(`File: ${plan.path}`)
  if (plan.overview) lines.push("", plan.overview)
  if (plan.todos.length > 0) {
    lines.push("", "Todos:")
    for (const todo of plan.todos) {
      const mark = todo.status === "completed" ? "[x]" : "[ ]"
      lines.push(`- ${mark} ${todo.content} (${todo.status})`)
    }
  }
  if (plan.body) lines.push("", plan.body)
  return lines.join("\n")
}
