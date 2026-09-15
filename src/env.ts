import { existsSync, readFileSync } from "node:fs"
import { homedir } from "node:os"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..")

/** Load key=value pairs from a .env file without overriding existing process.env. */
export function loadEnvFile(filePath = resolve(PROJECT_ROOT, ".env")): void {
  if (!existsSync(filePath)) return

  const text = readFileSync(filePath, "utf8")
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith("#")) continue

    const eq = line.indexOf("=")
    if (eq <= 0) continue

    const key = line.slice(0, eq).trim()
    if (!key || process.env[key] !== undefined) continue

    let value = line.slice(eq + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }

    process.env[key] = expandEnvValue(value)
  }
}

/** Expand ~ and $HOME / ${HOME} in path-like env values. */
export function expandEnvValue(value: string): string {
  const home = homedir()
  return value
    .replace(/^~/g, home)
    .replace(/\$\{HOME\}/g, home)
    .replace(/\$HOME/g, home)
}
