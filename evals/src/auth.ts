import type { AuthStorage } from "@earendil-works/pi-coding-agent";

export function preflightProviders(
  authStorage: AuthStorage,
  providers: string[],
): { ok: boolean; missing: string[] } {
  const missing: string[] = [];
  const seen = new Set<string>();
  for (const provider of providers) {
    if (seen.has(provider)) continue;
    seen.add(provider);
    const status = authStorage.getAuthStatus(provider);
    if (!status.configured) {
      missing.push(provider);
    }
  }
  return { ok: missing.length === 0, missing };
}
