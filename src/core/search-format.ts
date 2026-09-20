import type { SearchResultGroup } from "./types"

export function formatSearchResultsHuman(groups: SearchResultGroup[]): string {
  if (groups.length === 0) return "No matches found.\n"

  const lines: string[] = []
  let lastProject = ""

  for (const group of groups) {
    if (group.projectName !== lastProject) {
      if (lines.length > 0) lines.push("")
      lines.push(group.projectName)
      lastProject = group.projectName
    }

    const matchLabel = group.matchCount === 1 ? "1 match" : `${group.matchCount} matches`
    lines.push(`  ${group.sessionTitle.padEnd(32)} ${matchLabel}`)
    for (const hit of group.hits) {
      lines.push(`    ${hit.snippet}`)
    }
  }

  return `${lines.join("\n")}\n`
}
