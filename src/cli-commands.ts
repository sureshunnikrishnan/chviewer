import { writeFileSync } from "node:fs"
import type { Database } from "bun:sqlite"
import { formatSessionJson, formatSessionPlain } from "./core/export"
import { formatGitSessionContextPlain, resolveGitSessionContext } from "./core/git"
import { formatKnowledgeListPlain } from "./core/knowledge"
import { applyAutoKnowledge } from "./core/knowledge-sync"
import {
  formatSessionIntelligenceReport,
  sessionIntelligence,
  sessionOutcome,
} from "./core/session-intelligence"
import { formatSearchResultsHuman } from "./core/search-format"
import { parseCliDateFlag } from "./core/search-query"
import type { SearchFilters } from "./core/types"
import { getAgentSession, resolveSessionId, searchSessions } from "./db/store"
import { listKnowledge, listKnowledgeForSession } from "./db/knowledge-store"

export type SearchCliOptions = {
  query: string
  json: boolean
  project?: string
  session?: string
  role?: string
  event?: string
  before?: string
  after?: string
}

export type ExportCliOptions = {
  sessionRef: string
  format: "markdown" | "json"
  outputPath?: string
  includeGit?: boolean
}

export type GitCliOptions = {
  sessionRef: string
  json: boolean
}

export type IntelligenceCliOptions = {
  sessionRef: string
  json: boolean
}

export type KnowledgeCliOptions = {
  sessionRef?: string
  json: boolean
}

export function parseSearchCliArgs(argv: string[]): SearchCliOptions | null {
  if (argv.length === 0) return null

  const options: SearchCliOptions = {
    query: "",
    json: false,
  }

  const queryParts: string[] = []

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]!
    switch (arg) {
      case "--json":
        options.json = true
        break
      case "--project":
        options.project = argv[++index]
        break
      case "--session":
        options.session = argv[++index]
        break
      case "--role":
        options.role = argv[++index]
        break
      case "--event":
        options.event = argv[++index]
        break
      case "--before":
        options.before = argv[++index]
        break
      case "--after":
        options.after = argv[++index]
        break
      default:
        if (arg.startsWith("--")) return null
        queryParts.push(arg)
    }
  }

  options.query = queryParts.join(" ").trim()
  if (!options.query) return null
  return options
}

export function parseExportCliArgs(argv: string[]): ExportCliOptions | null {
  if (argv.length === 0) return null

  const options: ExportCliOptions = {
    sessionRef: argv[0]!,
    format: "markdown",
  }

  for (let index = 1; index < argv.length; index += 1) {
    const arg = argv[index]!
    if (arg === "--format") {
      const value = argv[++index]
      if (value !== "markdown" && value !== "json") return null
      options.format = value
      continue
    }
    if (arg === "--git") {
      options.includeGit = true
      continue
    }
    if (arg === "-o" || arg === "--output") {
      options.outputPath = argv[++index]
      continue
    }
    return null
  }

  return options
}

export function parseGitCliArgs(argv: string[]): GitCliOptions | null {
  if (argv.length === 0) return null

  const options: GitCliOptions = {
    sessionRef: argv[0]!,
    json: false,
  }

  for (let index = 1; index < argv.length; index += 1) {
    const arg = argv[index]!
    if (arg === "--json") {
      options.json = true
      continue
    }
    return null
  }

  return options
}

export function parseIntelligenceCliArgs(argv: string[]): IntelligenceCliOptions | null {
  if (argv.length === 0) return null

  const options: IntelligenceCliOptions = {
    sessionRef: argv[0]!,
    json: false,
  }

  for (let index = 1; index < argv.length; index += 1) {
    const arg = argv[index]!
    if (arg === "--json") {
      options.json = true
      continue
    }
    return null
  }

  return options
}

export function parseKnowledgeCliArgs(argv: string[]): KnowledgeCliOptions {
  const options: KnowledgeCliOptions = {
    json: false,
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]!
    if (arg === "--json") {
      options.json = true
      continue
    }
    if (arg.startsWith("--")) return { json: false, sessionRef: undefined }
    options.sessionRef = arg
  }

  return options
}

function searchFiltersFromCli(options: SearchCliOptions): Partial<SearchFilters> {
  return {
    project: options.project,
    session: options.session,
    role: options.role,
    event: options.event,
    before: parseCliDateFlag(options.before),
    after: parseCliDateFlag(options.after),
  }
}

export async function runSearchCommand(db: Database, options: SearchCliOptions): Promise<number> {
  const groups = searchSessions(db, options.query, searchFiltersFromCli(options))

  if (options.json) {
    process.stdout.write(`${JSON.stringify(groups, null, 2)}\n`)
    return 0
  }

  process.stdout.write(formatSearchResultsHuman(groups))
  return groups.length === 0 ? 1 : 0
}

export async function runExportCommand(db: Database, options: ExportCliOptions): Promise<number> {
  const sessionId = resolveSessionId(db, options.sessionRef)
  if (!sessionId) {
    console.error(`Session not found: ${options.sessionRef}`)
    return 1
  }

  const session = await getAgentSession(db, sessionId)
  if (!session) {
    console.error(`Session not found: ${options.sessionRef}`)
    return 1
  }

  applyAutoKnowledge(db, session)
  const knowledge = listKnowledgeForSession(db, sessionId)

  let content =
    options.format === "json"
      ? formatSessionJson(session, { knowledge })
      : formatSessionPlain(session, { knowledge })

  if (options.includeGit) {
    const git = await resolveGitSessionContext(session, session.project.sourcePath)
    if (options.format === "json") {
      content = formatSessionJson(session, { git })
    } else {
      content = `${content.trimEnd()}\n\n${formatGitSessionContextPlain(session, git)}`
    }
  }

  if (options.outputPath) {
    writeFileSync(options.outputPath, content, "utf8")
    console.log(`Wrote ${options.outputPath}`)
    return 0
  }

  process.stdout.write(content)
  return 0
}

export async function runGitCommand(db: Database, options: GitCliOptions): Promise<number> {
  const sessionId = resolveSessionId(db, options.sessionRef)
  if (!sessionId) {
    console.error(`Session not found: ${options.sessionRef}`)
    return 1
  }

  const session = await getAgentSession(db, sessionId)
  if (!session) {
    console.error(`Session not found: ${options.sessionRef}`)
    return 1
  }

  const git = await resolveGitSessionContext(session, session.project.sourcePath)

  if (options.json) {
    process.stdout.write(`${JSON.stringify({ sessionId, git, files: session.files }, null, 2)}\n`)
    return 0
  }

  process.stdout.write(formatGitSessionContextPlain(session, git))
  return 0
}

export async function runIntelligenceCommand(
  db: Database,
  options: IntelligenceCliOptions,
): Promise<number> {
  const sessionId = resolveSessionId(db, options.sessionRef)
  if (!sessionId) {
    console.error(`Session not found: ${options.sessionRef}`)
    return 1
  }

  const session = await getAgentSession(db, sessionId)
  if (!session) {
    console.error(`Session not found: ${options.sessionRef}`)
    return 1
  }

  applyAutoKnowledge(db, session)

  if (options.json) {
    process.stdout.write(
      `${JSON.stringify(
        {
          sessionId,
          intelligence: sessionIntelligence(session),
          outcome: sessionOutcome(session),
        },
        null,
        2,
      )}\n`,
    )
    return 0
  }

  process.stdout.write(`${formatSessionIntelligenceReport(session)}\n`)
  return 0
}

export async function runKnowledgeCommand(
  db: Database,
  options: KnowledgeCliOptions,
): Promise<number> {
  if (options.sessionRef) {
    const sessionId = resolveSessionId(db, options.sessionRef)
    if (!sessionId) {
      console.error(`Session not found: ${options.sessionRef}`)
      return 1
    }

    const items = listKnowledgeForSession(db, sessionId)
    if (options.json) {
      process.stdout.write(`${JSON.stringify(items, null, 2)}\n`)
      return 0
    }

    process.stdout.write(formatKnowledgeListPlain(items))
    return items.length === 0 ? 1 : 0
  }

  const items = listKnowledge(db)
  if (options.json) {
    process.stdout.write(`${JSON.stringify(items, null, 2)}\n`)
    return 0
  }

  process.stdout.write(formatKnowledgeListPlain(items))
  return items.length === 0 ? 1 : 0
}
