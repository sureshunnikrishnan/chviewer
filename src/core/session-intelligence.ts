import type { AgentEvent, AgentSession } from "./agent-session"
import { isTimelineVisible } from "./agent-session"

export type SessionIntelligence = {
  problem: string | null
  filesInvolved: string[]
  commands: string[]
  errors: string[]
  successfulResolution: boolean | null
  languages: string[]
  libraries: string[]
}

export type SessionOutcome = {
  tests: "passed" | "failed" | "mixed" | "unknown"
  filesModified: number
  errorsEncountered: number
  finalCommand: string | null
}

const PROBLEM_MAX = 200

const EXTENSION_LANGUAGE: Record<string, string> = {
  ts: "TypeScript",
  tsx: "TypeScript",
  js: "JavaScript",
  jsx: "JavaScript",
  mjs: "JavaScript",
  cjs: "JavaScript",
  py: "Python",
  rb: "Ruby",
  go: "Go",
  rs: "Rust",
  java: "Java",
  kt: "Kotlin",
  swift: "Swift",
  cs: "C#",
  cpp: "C++",
  cc: "C++",
  cxx: "C++",
  c: "C",
  h: "C",
  hpp: "C++",
  sql: "SQL",
  sh: "Shell",
  bash: "Shell",
  zsh: "Shell",
  md: "Markdown",
  json: "JSON",
  yaml: "YAML",
  yml: "YAML",
  toml: "TOML",
  html: "HTML",
  css: "CSS",
  scss: "SCSS",
  vue: "Vue",
  svelte: "Svelte",
}

const TEST_COMMAND_PATTERN =
  /\b(test|vitest|jest|pytest|mocha|cargo test|go test|bun test|npm test|pnpm test|yarn test)\b/i

const PACKAGE_INSTALL_PATTERN =
  /\b(?:pnpm|npm|yarn|bun)\s+(?:add|install|i)\s+(?:-D\s+|-dev\s+)?(@[\w.-]+\/[\w.-]+|[\w.-]+)/gi

function visibleEvents(session: AgentSession): AgentEvent[] {
  return session.events.filter(isTimelineVisible)
}

function truncateProblem(text: string): string {
  const collapsed = text.trim().replace(/\s+/g, " ")
  if (collapsed.length <= PROBLEM_MAX) return collapsed
  return `${collapsed.slice(0, PROBLEM_MAX - 1)}…`
}

function filePriority(relations: AgentSession["files"][number]["relations"]): number {
  if (relations.includes("deleted")) return 0
  if (relations.includes("created")) return 1
  if (relations.includes("edited")) return 2
  return 3
}

export function orderedFilesInvolved(session: AgentSession): string[] {
  return [...session.files]
    .sort((a, b) => {
      const priorityDiff = filePriority(a.relations) - filePriority(b.relations)
      if (priorityDiff !== 0) return priorityDiff
      return a.path.localeCompare(b.path)
    })
    .map((file) => file.path)
}

function languageFromPath(path: string): string | null {
  const base = path.split("/").pop() ?? path
  const dot = base.lastIndexOf(".")
  if (dot <= 0) return null
  const ext = base.slice(dot + 1).toLowerCase()
  return EXTENSION_LANGUAGE[ext] ?? null
}

function extractLibrariesFromCommand(command: string): string[] {
  const libraries: string[] = []
  for (const match of command.matchAll(PACKAGE_INSTALL_PATTERN)) {
    const pkg = match[1]
    if (pkg) libraries.push(pkg)
  }
  return libraries
}

function extractLibrariesFromPath(path: string): string[] {
  const libraries: string[] = []
  const nodeModules = /node_modules\/(@[^/]+\/[^/]+|[^/]+)/
  const match = path.match(nodeModules)
  if (match?.[1]) libraries.push(match[1])
  const scopedInPath = path.match(/@[\w.-]+\/[\w.-]+/)
  if (scopedInPath?.[0] && !libraries.includes(scopedInPath[0])) {
    libraries.push(scopedInPath[0])
  }
  return libraries
}

function isTestCommand(command: string): boolean {
  return TEST_COMMAND_PATTERN.test(command)
}

function isFailingCommand(
  event: AgentEvent,
): event is Extract<AgentEvent, { type: "command" }> {
  return event.type === "command" && event.exitCode !== undefined && event.exitCode !== 0
}

function isErrorLike(event: AgentEvent): boolean {
  return event.type === "error" || isFailingCommand(event)
}

function errorMessage(event: AgentEvent): string | null {
  if (event.type === "error") return event.message
  if (isFailingCommand(event)) {
    const code = event.exitCode
    return `${event.command} (exit ${code})`
  }
  return null
}

export function sessionIntelligence(session: AgentSession): SessionIntelligence {
  const events = visibleEvents(session)
  const firstPrompt = events.find((event) => event.type === "user_prompt")

  const commands: string[] = []
  for (const event of events) {
    if (event.type !== "command") continue
    const last = commands[commands.length - 1]
    if (last !== event.command) commands.push(event.command)
  }

  const errors: string[] = []
  for (const event of events) {
    const message = errorMessage(event)
    if (message && !errors.includes(message)) errors.push(message)
  }

  const languageSet = new Set<string>()
  for (const path of orderedFilesInvolved(session)) {
    const language = languageFromPath(path)
    if (language) languageSet.add(language)
  }

  const librarySet = new Set<string>()
  for (const command of commands) {
    for (const library of extractLibrariesFromCommand(command)) {
      librarySet.add(library)
    }
  }
  for (const path of orderedFilesInvolved(session)) {
    for (const library of extractLibrariesFromPath(path)) {
      librarySet.add(library)
    }
  }

  let successfulResolution: boolean | null = null
  const testCommands = events.filter(
    (event): event is Extract<AgentEvent, { type: "command" }> =>
      event.type === "command" && isTestCommand(event.command),
  )

  if (testCommands.length > 0) {
    const lastTest = testCommands[testCommands.length - 1]!
    if (lastTest.exitCode === 0) {
      const laterFailure = events.some(
        (event) => event.seq > lastTest.seq && isErrorLike(event),
      )
      successfulResolution = laterFailure ? false : true
    } else if (lastTest.exitCode !== undefined && lastTest.exitCode !== 0) {
      successfulResolution = false
    }
  } else {
    const commandsWithExit = events.filter(
      (event): event is Extract<AgentEvent, { type: "command" }> =>
        event.type === "command" && event.exitCode !== undefined,
    )
    if (commandsWithExit.length > 0) {
      const last = commandsWithExit[commandsWithExit.length - 1]!
      if (last.exitCode === 0) {
        const laterFailure = events.some(
          (event) => event.seq > last.seq && isErrorLike(event),
        )
        successfulResolution = laterFailure ? false : true
      } else {
        successfulResolution = false
      }
    }
  }

  return {
    problem: firstPrompt ? truncateProblem(firstPrompt.text) : null,
    filesInvolved: orderedFilesInvolved(session),
    commands,
    errors,
    successfulResolution,
    languages: [...languageSet].sort(),
    libraries: [...librarySet].sort(),
  }
}

export function sessionOutcome(session: AgentSession): SessionOutcome {
  const events = visibleEvents(session)
  const intelligence = sessionIntelligence(session)

  const modifiedPaths = new Set<string>()
  for (const file of session.files) {
    if (
      file.relations.includes("edited") ||
      file.relations.includes("created") ||
      file.relations.includes("deleted")
    ) {
      modifiedPaths.add(file.path)
    }
  }

  const testCommands = events.filter(
    (event): event is Extract<AgentEvent, { type: "command" }> =>
      event.type === "command" && isTestCommand(event.command),
  )

  let tests: SessionOutcome["tests"] = "unknown"
  if (testCommands.length > 0) {
    const withExit = testCommands.filter((event) => event.exitCode !== undefined)
    if (withExit.length === 0) {
      tests = "unknown"
    } else {
      const passed = withExit.some((event) => event.exitCode === 0)
      const failed = withExit.some((event) => event.exitCode !== 0)
      if (passed && failed) tests = "mixed"
      else if (passed) tests = "passed"
      else tests = "failed"
    }
  }

  const commandEvents = events.filter(
    (event): event is Extract<AgentEvent, { type: "command" }> => event.type === "command",
  )
  const finalCommand =
    commandEvents.length > 0 ? commandEvents[commandEvents.length - 1]!.command : null

  return {
    tests,
    filesModified: modifiedPaths.size,
    errorsEncountered: intelligence.errors.length,
    finalCommand,
  }
}

export function formatSessionOutcome(outcome: SessionOutcome): string {
  const testsLabel =
    outcome.tests === "passed"
      ? "eventually passed"
      : outcome.tests === "failed"
        ? "failed"
        : outcome.tests === "mixed"
          ? "mixed"
          : "unknown"

  const lines = [
    "Session outcome",
    `Tests: ${testsLabel}`,
    `Files modified: ${outcome.filesModified}`,
    `Errors encountered: ${outcome.errorsEncountered}`,
    `Final command: ${outcome.finalCommand ?? "(none)"}`,
  ]
  return lines.join("\n")
}

export function formatSessionIntelligence(intelligence: SessionIntelligence): string {
  const sections: string[] = []

  if (intelligence.problem) {
    sections.push("Problem", intelligence.problem, "")
  }

  sections.push(
    "Files involved",
    intelligence.filesInvolved.length > 0
      ? intelligence.filesInvolved.map((path) => `- ${path}`).join("\n")
      : "(none)",
    "",
    "Commands",
    intelligence.commands.length > 0
      ? intelligence.commands.map((command) => `- ${command}`).join("\n")
      : "(none)",
    "",
    "Errors",
    intelligence.errors.length > 0
      ? intelligence.errors.map((error) => `- ${error}`).join("\n")
      : "(none)",
    "",
    "Languages",
    intelligence.languages.length > 0 ? intelligence.languages.join(", ") : "(none)",
    "",
    "Libraries",
    intelligence.libraries.length > 0 ? intelligence.libraries.join(", ") : "(none)",
  )

  if (intelligence.successfulResolution !== null) {
    sections.push(
      "",
      "Resolution",
      intelligence.successfulResolution ? "Resolved successfully" : "Not resolved",
    )
  }

  return sections.join("\n").trimEnd()
}

export function formatCompactOutcome(outcome: SessionOutcome): string {
  const parts: string[] = []

  if (outcome.tests === "passed") parts.push("Tests passed")
  else if (outcome.tests === "failed") parts.push("Tests failed")
  else if (outcome.tests === "mixed") parts.push("Tests mixed")

  if (outcome.filesModified > 0) {
    parts.push(`${outcome.filesModified} file${outcome.filesModified === 1 ? "" : "s"}`)
  }

  if (outcome.errorsEncountered > 0) {
    parts.push(`${outcome.errorsEncountered} error${outcome.errorsEncountered === 1 ? "" : "s"}`)
  }

  return parts.length > 0 ? ` · ${parts.join(" · ")}` : ""
}

export function formatSessionIntelligenceReport(session: AgentSession): string {
  const intelligence = sessionIntelligence(session)
  const outcome = sessionOutcome(session)
  return `${formatSessionOutcome(outcome)}\n\n${formatSessionIntelligence(intelligence)}`
}
