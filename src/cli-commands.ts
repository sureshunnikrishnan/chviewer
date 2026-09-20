import { writeFileSync } from "node:fs"
import type { Database } from "bun:sqlite"
import { formatSessionJson, formatSessionPlain } from "./core/export"
import { formatSearchResultsHuman } from "./core/search-format"
import { parseCliDateFlag } from "./core/search-query"
import type { SearchFilters } from "./core/types"
import { getAgentSession, resolveSessionId, searchSessions } from "./db/store"

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
    if (arg === "-o" || arg === "--output") {
      options.outputPath = argv[++index]
      continue
    }
    return null
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

  const content =
    options.format === "json" ? formatSessionJson(session) : formatSessionPlain(session)

  if (options.outputPath) {
    writeFileSync(options.outputPath, content, "utf8")
    console.log(`Wrote ${options.outputPath}`)
    return 0
  }

  process.stdout.write(content)
  return 0
}
