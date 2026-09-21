import type { AgentEvent, SessionFile } from "./agent-session"
import type { GitSessionContext, NearbyCommit } from "./git"
import { findLastTranscriptEditForPath, gitDiffForFile } from "./git"
import { formatEventDetailPlain, formatFileEditUnifiedDiff } from "../ui/event-detail"
import { formatRelationBadges } from "./session-files"

function shortHash(hash: string): string {
  return hash.slice(0, 7)
}

export function formatGitHeader(context: GitSessionContext): string {
  if (!context.repository) return "Git: repository not found"

  const parts = [context.repository.path.split(/[/\\]/).pop() ?? context.repository.path]
  if (context.branch) parts.push(`branch ${context.branch} (now)`)
  if (context.headBefore && context.headAfter) {
    parts.push(`${shortHash(context.headBefore)}…${shortHash(context.headAfter)}`)
  }
  return parts.join(" · ")
}

export async function loadGitFilePatch(
  file: SessionFile,
  context: GitSessionContext,
  events: AgentEvent[],
): Promise<{ header: string; patch: string | null; fallbackText?: string }> {
  const header = [
    `File: ${file.path}`,
    `Relations: ${file.relations.join(", ")}`,
    "Source: Git diff (session window)",
  ].join("\n")

  if (!context.repository) {
    return {
      header,
      patch: null,
      fallbackText: appendTranscriptFallback([], file.path, events).trim(),
    }
  }

  const patch = await gitDiffForFile(
    context.repository.path,
    context.headBefore,
    context.headAfter,
    file.path,
  )

  if (patch) {
    return { header, patch }
  }

  const fallbackLines = ["No Git changes for this file in the session window."]
  const transcript = transcriptPatchForPath(file.path, events)
  if (transcript) {
    fallbackLines.push("", "Transcript edit (from agent tools):", transcript)
  }

  return { header, patch: null, fallbackText: fallbackLines.join("\n") }
}

function transcriptPatchForPath(filePath: string, events: AgentEvent[]): string | null {
  const event = findLastTranscriptEditForPath(events, filePath)
  if (!event || event.type !== "file_edit") return null
  const patch = formatFileEditUnifiedDiff(event)
  if (patch) return patch
  return formatEventDetailPlain(event)
}

function appendTranscriptFallback(
  lines: string[],
  filePath: string,
  events: AgentEvent[],
): string {
  const transcript = transcriptPatchForPath(filePath, events)
  if (transcript) {
    lines.push("", "Transcript edit (from agent tools):", transcript)
  }
  return lines.join("\n")
}

export function formatNearbyCommitDetail(commit: NearbyCommit): string {
  const lines = [
    `Commit: ${commit.shortHash}`,
    `Subject: ${commit.subject}`,
    `Author date: ${new Date(commit.authorDate).toISOString()}`,
    "",
    "Nearby commit — heuristic correlation only.",
    "",
  ]

  if (commit.overlappingPaths.length > 0) {
    lines.push("Overlapping session files:")
    for (const path of commit.overlappingPaths) {
      lines.push(`  - ${path}`)
    }
    lines.push("")
  }

  if (commit.files.length > 0) {
    lines.push("Files in commit:")
    for (const path of commit.files) {
      lines.push(`  - ${path}`)
    }
  }

  return lines.join("\n")
}

export function gitFileOptionLabel(file: SessionFile): string {
  const badges = formatRelationBadges(file.relations)
  const name = file.path.split(/[/\\]/).pop() ?? file.path
  return badges ? `[${badges}] ${name}` : name
}

export function gitFileOptionDescription(file: SessionFile): string {
  return file.path
}

export function gitCommitOptionLabel(commit: NearbyCommit): string {
  const overlap =
    commit.overlapCount > 0 ? ` · overlap ${commit.overlapCount}` : ""
  return `${commit.shortHash} ${commit.subject}${overlap}`
}

export function gitCommitOptionDescription(commit: NearbyCommit): string {
  return new Date(commit.authorDate).toISOString()
}
