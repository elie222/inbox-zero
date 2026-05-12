import { env } from "@/env";

export type LoginProvider = "google" | "microsoft" | "apple" | "sso";

const ALL_LOGIN_PROVIDERS: ReadonlySet<LoginProvider> = new Set([
  "google",
  "microsoft",
  "apple",
  "sso",
]);

/**
 * Parse `NEXT_PUBLIC_LOGIN_PROVIDERS` into the set of providers that should
 * appear on the login screen. When the env var is unset or empty, all providers
 * are considered enabled (backwards compatible). Unknown tokens are ignored.
 *
 * The returned set is intersected with the providers that are otherwise
 * configured (e.g. Microsoft OAuth credentials present, SSO_LOGIN_ENABLED set),
 * so the env var can only narrow the visible buttons, never widen them.
 */
export function getEnabledLoginProviders(
  raw: string | undefined = env.NEXT_PUBLIC_LOGIN_PROVIDERS,
): ReadonlySet<LoginProvider> {
  if (!raw?.trim()) return ALL_LOGIN_PROVIDERS;

  const requested = new Set<LoginProvider>();
  for (const token of raw.split(",")) {
    const normalized = token.trim().toLowerCase();
    if (
      normalized === "google" ||
      normalized === "microsoft" ||
      normalized === "apple" ||
      normalized === "sso"
    ) {
      requested.add(normalized);
    }
  }

  // Empty list after filtering -> treat as unset to avoid locking everyone out.
  if (requested.size === 0) return ALL_LOGIN_PROVIDERS;

  return requested;
}

export function isLoginProviderEnabled(
  provider: LoginProvider,
  raw?: string,
): boolean {
  return getEnabledLoginProviders(raw).has(provider);
}
