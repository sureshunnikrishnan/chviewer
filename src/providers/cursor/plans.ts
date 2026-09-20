import { readdir } from "node:fs/promises"
import { basename, join } from "node:path"
import { expandEnvValue } from "../../core/env"
import { resolvePlansDir } from "./paths"

type PlanContentPart = {
  type?: string
  name?: string
  input?: {
    name?: string
    path?: string
    [key: string]: unknown
  }
}

function normalizePlanKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/\.plan\.md$/i, "")
    .replace(/_[a-f0-9]{8}$/i, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
}

function isPlanFilePath(value: string): boolean {
  return (
    value.endsWith(".plan.md") &&
    !value.includes("*") &&
    (value.startsWith("/") || value.startsWith("~"))
  )
}

async function listPlanFiles(plansDir: string): Promise<string[]> {
  try {
    const entries = await readdir(plansDir)
    return entries
      .filter((name) => name.endsWith(".plan.md"))
      .map((name) => join(plansDir, name))
  } catch {
    return []
  }
}

function resolvePlanNamesToPaths(names: string[], planFiles: string[]): string[] {
  const paths: string[] = []
  for (const name of names) {
    const key = normalizePlanKey(name)
    if (!key) continue
    for (const file of planFiles) {
      if (normalizePlanKey(basename(file)) === key) paths.push(file)
    }
  }
  return paths
}

function collectFromPayload(payload: Record<string, unknown>, planPaths: Set<string>, planNames: Set<string>): void {
  const blob = JSON.stringify(payload)

  for (const match of blob.matchAll(/(?:~|\/)[^\s"'<>\\]+?\.plan\.md/g)) {
    const path = match[0]
    if (isPlanFilePath(path)) planPaths.add(expandEnvValue(path))
  }

  const tools = payload.tools
  if (Array.isArray(tools)) {
    for (const tool of tools) {
      if (!tool || typeof tool !== "object") continue
      const entry = tool as { tool?: string; input?: PlanContentPart["input"] }
      if (entry.tool === "CreatePlan") {
        const planName = entry.input?.name
        if (typeof planName === "string" && planName.trim()) {
          planNames.add(planName.trim())
        }
      }
      const inputPath = entry.input?.path
      if (typeof inputPath === "string" && isPlanFilePath(inputPath)) {
        planPaths.add(expandEnvValue(inputPath))
      }
    }
  }

  const tool = payload.tool
  if (tool === "CreatePlan") {
    const input = payload.input as PlanContentPart["input"] | undefined
    const planName = input?.name
    if (typeof planName === "string" && planName.trim()) {
      planNames.add(planName.trim())
    }
    const inputPath = input?.path
    if (typeof inputPath === "string" && isPlanFilePath(inputPath)) {
      planPaths.add(expandEnvValue(inputPath))
    }
  }
}

export async function resolvePlanPathsFromPayloads(
  payloads: Record<string, unknown>[],
  plansDir = resolvePlansDir(),
): Promise<string[]> {
  const planPaths = new Set<string>()
  const planNames = new Set<string>()

  for (const payload of payloads) {
    collectFromPayload(payload, planPaths, planNames)
  }

  if (planNames.size > 0) {
    const planFiles = await listPlanFiles(plansDir)
    for (const path of resolvePlanNamesToPaths([...planNames], planFiles)) {
      planPaths.add(path)
    }
  }

  return [...planPaths].sort()
}
