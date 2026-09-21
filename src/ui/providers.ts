import type { ConfiguredProvider } from "../providers/configured"

export function formatProviderHeaderLine(
  activeId: string,
  providers: ConfiguredProvider[],
): string {
  if (providers.length === 0) return "No providers configured in .env"

  return providers
    .map((provider) => (provider.id === activeId ? `[${provider.label}]` : provider.label))
    .join(" · ")
}
