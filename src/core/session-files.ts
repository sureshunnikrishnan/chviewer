import type { AgentEvent } from "./agent-session"
import type { NormalizedEvent } from "./types"

export type FileRelation = "read" | "edited" | "created" | "deleted"

export type SessionFile = {
  path: string
  relations: FileRelation[]
}

const RELATION_ORDER: FileRelation[] = ["read", "edited", "created", "deleted"]

function editRelation(editKind: string): FileRelation {
  switch (editKind) {
    case "Write":
      return "created"
    case "Delete":
      return "deleted"
    default:
      return "edited"
  }
}

function relationFromNormalizedEvent(event: NormalizedEvent): { path: string; relation: FileRelation } | null {
  const payload = event.payload

  if (event.kind === "file_read") {
    const path = typeof payload.path === "string" ? payload.path : null
    if (!path) return null
    return { path, relation: "read" }
  }

  if (event.kind === "file_edit") {
    const input =
      payload.input && typeof payload.input === "object" && !Array.isArray(payload.input)
        ? (payload.input as Record<string, unknown>)
        : {}
    const path =
      (typeof payload.path === "string" ? payload.path : null) ??
      (typeof input.path === "string" ? input.path : null)
    if (!path) return null

    const editKindRaw = typeof payload.editKind === "string" ? payload.editKind : "StrReplace"
    const normalizedKind =
      editKindRaw === "Write" || editKindRaw === "Delete" || editKindRaw === "delete"
        ? editKindRaw === "delete"
          ? "Delete"
          : editKindRaw
        : "StrReplace"

    return { path, relation: editRelation(normalizedKind) }
  }

  return null
}

function relationFromAgentEvent(event: AgentEvent): { path: string; relation: FileRelation } | null {
  if (event.type === "file_read") {
    return { path: event.path, relation: "read" }
  }

  if (event.type === "file_edit") {
    return { path: event.path, relation: editRelation(event.editKind) }
  }

  return null
}

function aggregateRelations(
  entries: Array<{ path: string; relation: FileRelation }>,
): SessionFile[] {
  const byPath = new Map<string, Set<FileRelation>>()

  for (const entry of entries) {
    let relations = byPath.get(entry.path)
    if (!relations) {
      relations = new Set()
      byPath.set(entry.path, relations)
    }
    relations.add(entry.relation)
  }

  return [...byPath.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([path, relations]) => ({
      path,
      relations: RELATION_ORDER.filter((relation) => relations.has(relation)),
    }))
}

export function sessionFilesFromNormalizedEvents(events: NormalizedEvent[]): SessionFile[] {
  const entries: Array<{ path: string; relation: FileRelation }> = []
  for (const event of events) {
    const mapped = relationFromNormalizedEvent(event)
    if (mapped) entries.push(mapped)
  }
  return aggregateRelations(entries)
}

export function sessionFilesFromAgentEvents(events: AgentEvent[]): SessionFile[] {
  const entries: Array<{ path: string; relation: FileRelation }> = []
  for (const event of events) {
    const mapped = relationFromAgentEvent(event)
    if (mapped) entries.push(mapped)
  }
  return aggregateRelations(entries)
}

export function formatRelationBadges(relations: FileRelation[]): string {
  const badges: string[] = []
  if (relations.includes("read")) badges.push("R")
  if (relations.includes("edited")) badges.push("E")
  if (relations.includes("created")) badges.push("C")
  if (relations.includes("deleted")) badges.push("D")
  return badges.join("")
}

export function formatSessionFilesSection(files: SessionFile[]): string {
  if (files.length === 0) return ""

  const lines = ["## Files", ""]
  for (const file of files) {
    const badges = formatRelationBadges(file.relations)
    lines.push(badges ? `- [${badges}] ${file.path}` : `- ${file.path}`)
  }
  lines.push("")
  return lines.join("\n")
}
