import { spawn } from "node:child_process"
import { existsSync, realpathSync, statSync } from "node:fs"
import { dirname, isAbsolute, join, relative, resolve } from "node:path"
import type { AgentEvent, AgentSession, SessionFile } from "./agent-session"
import type { FileRelation } from "./session-files"

const GIT_TIMEOUT_MS = 8_000
const AFTER_PAD_MS = 30 * 60 * 1000
const MAX_NEARBY_COMMITS = 20

export type GitRepositoryInfo = {
  path: string
  originUrl?: string
}

export type GitCommitInfo = {
  hash: string
  shortHash: string
  subject: string
  authorDate: number
  files: string[]
}

export type NearbyCommit = GitCommitInfo & {
  overlapCount: number
  overlappingPaths: string[]
}

export type GitChangedFile = {
  path: string
  status: string
}

export type GitSessionContext = {
  repository: GitRepositoryInfo | null
  branch: string | null
  headBefore: string | null
  headAfter: string | null
  commits: GitCommitInfo[]
  changedFiles: GitChangedFile[]
  nearbyCommits: NearbyCommit[]
  heuristicNote: string
}

type GitSpawnResult = {
  ok: boolean
  stdout: string
  stderr: string
}

function runGit(args: string[], cwd?: string): Promise<GitSpawnResult> {
  return new Promise((resolvePromise) => {
    try {
      const proc = spawn("git", args, {
        cwd,
        env: {
          ...process.env,
          GIT_TERMINAL_PROMPT: "0",
        },
      })

      let stdout = ""
      let stderr = ""
      let settled = false

      const finish = (result: GitSpawnResult) => {
        if (settled) return
        settled = true
        clearTimeout(timeout)
        resolvePromise(result)
      }

      const timeout = setTimeout(() => {
        proc.kill()
        finish({ ok: false, stdout: stdout.trimEnd(), stderr: stderr.trimEnd() })
      }, GIT_TIMEOUT_MS)

      proc.stdout?.on("data", (chunk) => {
        stdout += String(chunk)
      })
      proc.stderr?.on("data", (chunk) => {
        stderr += String(chunk)
      })
      proc.on("error", () => finish({ ok: false, stdout: "", stderr: "" }))
      proc.on("close", (code) => {
        finish({
          ok: code === 0,
          stdout: stdout.trimEnd(),
          stderr: stderr.trimEnd(),
        })
      })
    } catch {
      resolvePromise({ ok: false, stdout: "", stderr: "" })
    }
  })
}

function isoTimestamp(ms: number): string {
  return new Date(ms).toISOString()
}

function shortHash(hash: string): string {
  return hash.slice(0, 7)
}

export function decodeCursorWorkspaceSlug(slug: string): string | null {
  if (!slug.startsWith("Users-")) return null

  const withoutUsers = slug.slice("Users-".length)
  const workspaceIndex = withoutUsers.indexOf("-workspace-")
  if (workspaceIndex < 0) return null

  const userPart = withoutUsers.slice(0, workspaceIndex)
  const pathPart = withoutUsers.slice(workspaceIndex + "-workspace-".length)
  if (!userPart || !pathPart) return null

  const segments = pathPart.split("-").filter(Boolean)
  if (segments.length === 0) return null

  return join("/", "Users", userPart, ...segments)
}

export function collectPathHints(session: AgentSession): string[] {
  const hints = new Set<string>()

  for (const file of session.files) {
    if (file.path && file.path !== "unknown") hints.add(file.path)
  }

  for (const event of session.events) {
    if (event.type === "command" && event.workingDirectory) {
      hints.add(event.workingDirectory)
    }
  }

  return [...hints]
}

async function gitTopLevel(startPath: string): Promise<string | null> {
  const absolute = resolve(startPath)
  let start = dirname(absolute)
  if (existsSync(absolute)) {
    start = statSync(absolute).isDirectory() ? absolute : dirname(absolute)
  }
  const result = await runGit(["-C", start, "rev-parse", "--show-toplevel"])
  if (!result.ok || !result.stdout) return null
  try {
    return realpathSync(result.stdout.trim())
  } catch {
    return result.stdout.trim()
  }
}

export async function discoverRepository(
  pathHints: string[],
  projectSourcePath?: string,
): Promise<string | null> {
  for (const hint of pathHints) {
    if (!hint || hint === "unknown") continue
    const candidate = isAbsolute(hint) ? hint : resolve(hint)
    const topLevel = await gitTopLevel(candidate)
    if (topLevel) return topLevel
  }

  if (projectSourcePath) {
    const slug = projectSourcePath.split(/[/\\]/).pop() ?? projectSourcePath
    const decoded = decodeCursorWorkspaceSlug(slug)
    if (decoded) {
      const segments = decoded.split(/[/\\]/).filter(Boolean)
      for (let index = segments.length; index >= 2; index -= 1) {
        const prefix = join("/", ...segments.slice(0, index))
        if (!existsSync(prefix)) continue
        const topLevel = await gitTopLevel(prefix)
        if (topLevel) return topLevel
      }
    }
  }

  return null
}

async function gitHeadBefore(repo: string, ms: number): Promise<string | null> {
  const result = await runGit([
    "-C",
    repo,
    "--no-pager",
    "log",
    "-1",
    "--format=%H",
    `--before=${isoTimestamp(ms)}`,
  ])
  return result.ok && result.stdout ? result.stdout.trim() : null
}

async function gitCurrentBranch(repo: string): Promise<string | null> {
  const result = await runGit(["-C", repo, "rev-parse", "--abbrev-ref", "HEAD"])
  if (!result.ok || !result.stdout) return null
  const branch = result.stdout.trim()
  return branch === "HEAD" ? null : branch
}

async function gitOriginUrl(repo: string): Promise<string | undefined> {
  const result = await runGit(["-C", repo, "remote", "get-url", "origin"])
  return result.ok && result.stdout ? result.stdout.trim() : undefined
}

async function gitLogBetween(
  repo: string,
  sinceMs: number,
  untilMs: number,
): Promise<GitCommitInfo[]> {
  const result = await runGit([
    "-C",
    repo,
    "--no-pager",
    "log",
    `--since=${isoTimestamp(sinceMs)}`,
    `--until=${isoTimestamp(untilMs)}`,
    "--format=%H%x09%at%x09%s",
    "--name-only",
  ])

  if (!result.ok || !result.stdout) return []

  const commits: GitCommitInfo[] = []
  let current: GitCommitInfo | null = null

  for (const line of result.stdout.split("\n")) {
    if (!line.trim()) continue

    const headerMatch = line.match(/^([0-9a-f]{40})\t(\d+)\t(.*)$/)
    if (headerMatch) {
      if (current) commits.push(current)
      current = {
        hash: headerMatch[1]!,
        shortHash: shortHash(headerMatch[1]!),
        authorDate: Number(headerMatch[2]!) * 1000,
        subject: headerMatch[3] ?? "",
        files: [],
      }
      continue
    }

    if (current) current.files.push(line.trim())
  }

  if (current) commits.push(current)
  return commits
}

async function gitDiffNameStatus(
  repo: string,
  fromSha: string,
  toSha: string,
): Promise<GitChangedFile[]> {
  if (fromSha === toSha) return []

  const result = await runGit([
    "-C",
    repo,
    "--no-pager",
    "diff",
    "--name-status",
    fromSha,
    toSha,
  ])

  if (!result.ok || !result.stdout) return []

  return result.stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split("\t")
      return {
        status: parts[0] ?? "?",
        path: parts[1] ?? line,
      }
    })
}

function normalizePathForCompare(path: string, repoRoot: string): string {
  const absolute = isAbsolute(path) ? path : join(repoRoot, path)
  try {
    return relative(repoRoot, absolute).replace(/\\/g, "/")
  } catch {
    return path.replace(/\\/g, "/")
  }
}

function sessionFilePathsForCompare(files: SessionFile[], repoRoot: string): Set<string> {
  const normalized = new Set<string>()
  for (const file of files) {
    normalized.add(normalizePathForCompare(file.path, repoRoot))
    if (file.path !== "unknown") normalized.add(file.path.replace(/\\/g, "/"))
  }
  return normalized
}

function relationWeight(relations: FileRelation[]): number {
  let weight = 0
  if (relations.includes("edited")) weight += 3
  if (relations.includes("created")) weight += 3
  if (relations.includes("deleted")) weight += 3
  if (relations.includes("read")) weight += 1
  return weight
}

function computeOverlap(
  commitFiles: string[],
  sessionPaths: Set<string>,
  sessionFiles: SessionFile[],
  repoRoot: string,
): { count: number; paths: string[] } {
  const byPath = new Map(sessionFiles.map((file) => [normalizePathForCompare(file.path, repoRoot), file]))
  const overlapping: string[] = []
  let score = 0

  for (const commitFile of commitFiles) {
    const normalizedCommitFile = commitFile.replace(/\\/g, "/")
    if (!sessionPaths.has(normalizedCommitFile)) continue

    overlapping.push(normalizedCommitFile)
    const sessionFile = byPath.get(normalizedCommitFile)
    score += sessionFile ? relationWeight(sessionFile.relations) : 1
  }

  return { count: score, paths: overlapping }
}

export function rankNearbyCommits(
  commits: GitCommitInfo[],
  sessionFiles: SessionFile[],
  repoRoot: string,
  sessionUpdatedAt: number,
): NearbyCommit[] {
  const sessionPaths = sessionFilePathsForCompare(sessionFiles, repoRoot)

  return commits
    .map((commit) => {
      const overlap = computeOverlap(commit.files, sessionPaths, sessionFiles, repoRoot)
      return {
        ...commit,
        overlapCount: overlap.count,
        overlappingPaths: overlap.paths,
      }
    })
    .sort((a, b) => {
      if (b.overlapCount !== a.overlapCount) return b.overlapCount - a.overlapCount
      const aDelta = Math.abs(a.authorDate - sessionUpdatedAt)
      const bDelta = Math.abs(b.authorDate - sessionUpdatedAt)
      return aDelta - bDelta
    })
    .slice(0, MAX_NEARBY_COMMITS)
}

export async function gitDiffForFile(
  repo: string,
  headBefore: string | null,
  headAfter: string | null,
  filePath: string,
): Promise<string | null> {
  if (!headBefore || !headAfter || headBefore === headAfter) return null

  const normalized = filePath.replace(/\\/g, "/")
  const repoRelative = isAbsolute(normalized)
    ? relative(repo, normalized).replace(/\\/g, "/")
    : normalized

  const result = await runGit([
    "-C",
    repo,
    "--no-pager",
    "diff",
    headBefore,
    headAfter,
    "--",
    repoRelative,
  ])

  return result.ok && result.stdout ? result.stdout : null
}

export function findLastTranscriptEditForPath(
  events: AgentEvent[],
  filePath: string,
): AgentEvent | null {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index]!
    if (event.type === "file_edit" && event.path === filePath) return event
  }
  return null
}

export async function resolveGitSessionContext(
  session: AgentSession,
  projectSourcePath?: string,
): Promise<GitSessionContext> {
  const heuristicNote =
    "Heuristic: session time window and overlapping files. Not proof of authorship."

  const pathHints = collectPathHints(session)
  const repoPath = await discoverRepository(pathHints, projectSourcePath)

  if (!repoPath) {
    return {
      repository: null,
      branch: null,
      headBefore: null,
      headAfter: null,
      commits: [],
      changedFiles: [],
      nearbyCommits: [],
      heuristicNote,
    }
  }

  const startedAt = session.startedAt?.getTime() ?? session.updatedAt?.getTime() ?? Date.now()
  const updatedAt = session.updatedAt?.getTime() ?? startedAt
  const untilMs = updatedAt + AFTER_PAD_MS

  const [originUrl, branch, headBefore, headAfter] = await Promise.all([
    gitOriginUrl(repoPath),
    gitCurrentBranch(repoPath),
    gitHeadBefore(repoPath, startedAt),
    gitHeadBefore(repoPath, untilMs),
  ])

  const [commits, changedFiles] = await Promise.all([
    gitLogBetween(repoPath, startedAt, untilMs),
    headBefore && headAfter
      ? gitDiffNameStatus(repoPath, headBefore, headAfter)
      : Promise.resolve([]),
  ])

  const nearbyCommits = rankNearbyCommits(
    commits,
    session.files,
    repoPath,
    updatedAt,
  )

  return {
    repository: { path: repoPath, originUrl },
    branch,
    headBefore,
    headAfter,
    commits,
    changedFiles,
    nearbyCommits,
    heuristicNote,
  }
}

export function formatGitSessionContextPlain(
  session: AgentSession,
  context: GitSessionContext,
): string {
  const lines: string[] = [`# Git context — ${session.title}`, ""]

  if (!context.repository) {
    lines.push("Repository: not found")
    lines.push("")
    if (session.files.length > 0) {
      lines.push("Session files:")
      for (const file of session.files) {
        lines.push(`  - ${file.path} (${file.relations.join(", ")})`)
      }
    }
    return `${lines.join("\n")}\n`
  }

  lines.push(`Repository: ${context.repository.path}`)
  if (context.repository.originUrl) lines.push(`Origin: ${context.repository.originUrl}`)
  if (context.branch) lines.push(`Current branch (now): ${context.branch}`)
  if (context.headBefore) lines.push(`HEAD before session: ${shortHash(context.headBefore)}`)
  if (context.headAfter) lines.push(`HEAD after session: ${shortHash(context.headAfter)}`)
  lines.push("")

  if (session.files.length > 0) {
    lines.push("Session files:")
    for (const file of session.files) {
      lines.push(`  - ${file.path} (${file.relations.join(", ")})`)
    }
    lines.push("")
  }

  if (context.changedFiles.length > 0) {
    lines.push("Changed files (session window):")
    for (const file of context.changedFiles) {
      lines.push(`  ${file.status}\t${file.path}`)
    }
    lines.push("")
  }

  lines.push("Nearby commits:")
  lines.push(context.heuristicNote)
  if (context.nearbyCommits.length === 0) {
    lines.push("  (none in window)")
  } else {
    for (const commit of context.nearbyCommits) {
      const overlap =
        commit.overlapCount > 0
          ? ` · overlap ${commit.overlapCount}`
          : ""
      lines.push(
        `  ${commit.shortHash} ${commit.subject}${overlap}`,
      )
      if (commit.overlappingPaths.length > 0) {
        lines.push(`    files: ${commit.overlappingPaths.join(", ")}`)
      }
    }
  }

  return `${lines.join("\n")}\n`
}
