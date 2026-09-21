import { afterEach, describe, expect, test } from "bun:test"
import { mkdirSync, realpathSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { spawnSync } from "node:child_process"
import type { AgentSession, SessionFile } from "../../src/core/agent-session"
import {
  decodeCursorWorkspaceSlug,
  discoverRepository,
  formatGitSessionContextPlain,
  rankNearbyCommits,
  resolveGitSessionContext,
} from "../../src/core/git"

const tempDirs: string[] = []

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true })
  }
})

function runGit(cwd: string, args: string[]): void {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" })
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || "git command failed")
  }
}

function createTempRepo(): string {
  const dir = join(tmpdir(), `ag-explorer-git-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  mkdirSync(dir, { recursive: true })
  tempDirs.push(dir)

  runGit(dir, ["init"])
  runGit(dir, ["config", "user.email", "test@example.com"])
  runGit(dir, ["config", "user.name", "Test User"])

  writeFileSync(join(dir, "README.md"), "initial\n", "utf8")
  runGit(dir, ["add", "README.md"])
  runGit(dir, ["commit", "-m", "initial"])

  mkdirSync(join(dir, "src"), { recursive: true })
  writeFileSync(join(dir, "src/auth.ts"), "export const auth = 1\n", "utf8")
  runGit(dir, ["add", "src/auth.ts"])
  runGit(dir, ["commit", "-m", "add auth"])

  return dir
}

describe("decodeCursorWorkspaceSlug", () => {
  test("reconstructs workspace path from slug", () => {
    expect(decodeCursorWorkspaceSlug("Users-fixtureuser-workspace-projects-demo")).toBe(
      "/Users/fixtureuser/projects/demo",
    )
  })
})

describe("discoverRepository", () => {
  test("finds repo from absolute file path hint", async () => {
    const repo = realpathSync(createTempRepo())
    const discovered = await discoverRepository([join(repo, "src/auth.ts")])
    expect(discovered).toBe(repo)
  })
})

describe("rankNearbyCommits", () => {
  test("ranks commits by overlapping session files", () => {
    const sessionFiles: SessionFile[] = [{ path: "src/auth.ts", relations: ["edited"] }]
    const ranked = rankNearbyCommits(
      [
        {
          hash: "a".repeat(40),
          shortHash: "aaaaaaa",
          subject: "docs only",
          authorDate: Date.now(),
          files: ["README.md"],
        },
        {
          hash: "b".repeat(40),
          shortHash: "bbbbbbb",
          subject: "auth change",
          authorDate: Date.now(),
          files: ["src/auth.ts"],
        },
      ],
      sessionFiles,
      "/repo",
      Date.now(),
    )

    expect(ranked[0]?.subject).toBe("auth change")
    expect(ranked[0]?.overlapCount).toBeGreaterThan(ranked[1]?.overlapCount ?? 0)
  })
})

describe("resolveGitSessionContext", () => {
  test("returns nearby commits without claiming authorship", async () => {
    const repo = realpathSync(createTempRepo())
    const startedAt = new Date(Date.now() - 60_000)
    const updatedAt = new Date(Date.now() + 60_000)

    const session: AgentSession = {
      id: 1,
      title: "Auth work",
      project: { id: 1, name: "demo", sourcePath: repo },
      startedAt,
      updatedAt,
      source: "cursor",
      sourcePath: "/tmp/session.jsonl",
      files: [{ path: join(repo, "src/auth.ts"), relations: ["edited"] }],
      events: [],
    }

    const context = await resolveGitSessionContext(session, repo)
    expect(context.repository?.path).toBe(repo)
    expect(context.heuristicNote).toContain("Not proof of authorship")
    expect(formatGitSessionContextPlain(session, context)).toContain("Nearby commits")
  })
})
