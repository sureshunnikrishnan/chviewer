import { loadEnvFile } from "./core/env"
import { formatIndexSummary, getDatabase, index, rebuild } from "./core/index"
import {
  parseExportCliArgs,
  parseGitCliArgs,
  parseIntelligenceCliArgs,
  parseKnowledgeCliArgs,
  parseSearchCliArgs,
  runExportCommand,
  runGitCommand,
  runIntelligenceCommand,
  runKnowledgeCommand,
  runSearchCommand,
} from "./cli-commands"
import { runApp } from "./ui/app"

function printUsage(): void {
  console.error(`Usage:
  ag-explorer [index|reindex|search|export|git|intelligence|knowledge]
  ag-explorer search <query> [--project name] [--session title|id] [--role user|assistant] [--event user|run|…] [--before ISO] [--after ISO] [--json]
  ag-explorer export <sessionId|title> [--format markdown|json] [--git] [-o path]
  ag-explorer git <sessionId|title> [--json]
  ag-explorer intelligence <sessionId|title> [--json]
  ag-explorer knowledge [sessionId|title] [--json]`)
}

async function main(): Promise<void> {
  loadEnvFile()

  const command = process.argv[2]

  if (command === "index") {
    const summary = await index()
    console.log(formatIndexSummary(summary))
    return
  }

  if (command === "reindex") {
    const summary = await rebuild()
    console.log(formatIndexSummary(summary))
    return
  }

  if (command === "search") {
    const options = parseSearchCliArgs(process.argv.slice(3))
    if (!options) {
      printUsage()
      process.exit(1)
    }
    await index()
    const code = await runSearchCommand(getDatabase(), options)
    process.exit(code)
  }

  if (command === "export") {
    const options = parseExportCliArgs(process.argv.slice(3))
    if (!options) {
      printUsage()
      process.exit(1)
    }
    await index()
    const code = await runExportCommand(getDatabase(), options)
    process.exit(code)
  }

  if (command === "git") {
    const options = parseGitCliArgs(process.argv.slice(3))
    if (!options) {
      printUsage()
      process.exit(1)
    }
    await index()
    const code = await runGitCommand(getDatabase(), options)
    process.exit(code)
  }

  if (command === "intelligence") {
    const options = parseIntelligenceCliArgs(process.argv.slice(3))
    if (!options) {
      printUsage()
      process.exit(1)
    }
    await index()
    const code = await runIntelligenceCommand(getDatabase(), options)
    process.exit(code)
  }

  if (command === "knowledge") {
    const options = parseKnowledgeCliArgs(process.argv.slice(3))
    await index()
    const code = await runKnowledgeCommand(getDatabase(), options)
    process.exit(code)
  }

  if (command !== undefined && command !== "tui") {
    printUsage()
    process.exit(1)
  }

  await runApp()
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
