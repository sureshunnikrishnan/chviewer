import { loadEnvFile } from "./core/env"
import { formatIndexSummary, getDatabase, index, rebuild } from "./core/index"
import {
  parseExportCliArgs,
  parseSearchCliArgs,
  runExportCommand,
  runSearchCommand,
} from "./cli-commands"
import { runApp } from "./ui/app"

function printUsage(): void {
  console.error(`Usage:
  ag-explorer [index|reindex|search|export]
  ag-explorer search <query> [--project name] [--session title|id] [--role user|assistant] [--event user|run|…] [--before ISO] [--after ISO] [--json]
  ag-explorer export <sessionId|title> [--format markdown|json] [-o path]`)
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
