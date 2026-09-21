import { claudeCodeProvider } from "./claude-code/index"
import { cursorProvider } from "./cursor/index"
import type { SessionProvider } from "./types"

const providers: SessionProvider[] = [cursorProvider, claudeCodeProvider]

const byId = new Map(providers.map((provider) => [provider.id, provider]))

export function allProviders(): SessionProvider[] {
  return [...providers]
}

export function getProvider(id: string): SessionProvider {
  const provider = byId.get(id)
  if (!provider) {
    throw new Error(`Unknown session provider: ${id}`)
  }
  return provider
}

export function tryGetProvider(id: string): SessionProvider | undefined {
  return byId.get(id)
}
