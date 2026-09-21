import { discoverClaudeCodeProjects, discoverClaudeCodeSessions } from "./discover"
import { parseSessionFile } from "./parse"
import { projectClaudeCodeEvents } from "./project"
import type { SessionProvider } from "../types"

export const claudeCodeProvider: SessionProvider = {
  id: "claude-code",
  capabilities: {
    toolCalls: true,
    fileChanges: true,
    commands: true,
    plans: false,
  },
  discoverProjects: discoverClaudeCodeProjects,
  discoverSessions: discoverClaudeCodeSessions,
  loadSession: (session) => parseSessionFile(session.sourcePath, session.titleHint),
  projectEvents: projectClaudeCodeEvents,
}
