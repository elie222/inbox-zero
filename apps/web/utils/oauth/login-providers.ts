import { env } from "@/env";
import {
  hasAppleOauthConfig,
  hasMicrosoftOauthConfig,
} from "@/utils/oauth/provider-config";

export type LoginProvider = "google" | "microsoft" | "apple" | "sso";

const KNOWN_LOGIN_PROVIDERS: ReadonlySet<LoginProvider> = new Set([
  "google",
  "microsoft",
  "apple",
  "sso",
]);

/**
 * Pure parser for the `LOGIN_PROVIDERS` allowlist string. Returns `null` when
 * the string is unset/empty so callers can apply legacy fallback behaviour.
 * Unknown tokens are dropped; if every token is unknown we also return `null`
 * to avoid locking admins out of their own deployment.
 */
function parseLoginProvidersAllowlist(
  raw: string | undefined,
): ReadonlySet<LoginProvider> | null {
  if (!raw?.trim()) return null;

  const requested = new Set<LoginProvider>();
  for (const token of raw.split(",")) {
    const normalized = token.trim().toLowerCase();
    if (KNOWN_LOGIN_PROVIDERS.has(normalized as LoginProvider)) {
      requested.add(normalized as LoginProvider);
    }
  }

  return requested.size > 0 ? requested : null;
}

export type LoginProviderResolutionInputs = {
  rawAllowlist?: string;
  hasMicrosoftConfig?: boolean;
  hasAppleConfig?: boolean;
  legacySsoLoginEnabled?: boolean;
};

/**
 * Single source of truth for which login providers are enabled. Used by the
 * login page UI *and* by `utils/auth.ts` to gate which providers better-auth
 * registers, so a malicious client can't bypass the allowlist by calling the
 * sign-in API directly.
 *
 * Resolution:
 * 1. Parse `LOGIN_PROVIDERS` (server-side). When set, the result is intersected
 *    with what's actually configured at the credential layer — the var can
 *    only narrow, never widen.
 * 2. When `LOGIN_PROVIDERS` is unset, configured OAuth providers are enabled
 *    and SSO falls back to the legacy `SSO_LOGIN_ENABLED` flag.
 */
export function getEnabledLoginProviders(
  inputs: LoginProviderResolutionInputs = {},
): ReadonlySet<LoginProvider> {
  const {
    rawAllowlist = env.LOGIN_PROVIDERS,
    hasMicrosoftConfig = hasMicrosoftOauthConfig(),
    hasAppleConfig = hasAppleOauthConfig(),
    legacySsoLoginEnabled = env.SSO_LOGIN_ENABLED,
  } = inputs;

  const allowlist = parseLoginProvidersAllowlist(rawAllowlist);

  const enabled = new Set<LoginProvider>();

  if (!allowlist || allowlist.has("google")) {
    enabled.add("google");
  }
  if ((!allowlist || allowlist.has("microsoft")) && hasMicrosoftConfig) {
    enabled.add("microsoft");
  }
  if (allowlist?.has("apple") && hasAppleConfig) {
    enabled.add("apple");
  }
  if (allowlist ? allowlist.has("sso") : legacySsoLoginEnabled) {
    enabled.add("sso");
  }

  return enabled;
}

export function isLoginProviderEnabled(provider: LoginProvider): boolean {
  return getEnabledLoginProviders().has(provider);
}
