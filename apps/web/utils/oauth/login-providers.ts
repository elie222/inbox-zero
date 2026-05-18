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

// Returns `null` for unset/empty input, or when every token is unknown, so
// callers fall back to legacy behaviour instead of locking admins out.
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

// Single source of truth for which login providers are enabled. Used by the
// login page UI *and* by `utils/auth.ts` to gate which providers better-auth
// registers, so a client can't bypass the allowlist by calling the sign-in API
// directly. When `LOGIN_PROVIDERS` is set, it can only narrow what is already
// configured at the credential layer, never widen it.
export function getEnabledLoginProviders(
  inputs: {
    rawAllowlist?: string;
    hasMicrosoftConfig?: boolean;
    hasAppleConfig?: boolean;
    legacySsoLoginEnabled?: boolean;
  } = {},
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
