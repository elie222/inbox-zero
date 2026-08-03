import type { PostHog } from "posthog-js";
import type { LoginProvider } from "@/utils/oauth/login-providers";

export type AuthFunnelProvider = LoginProvider | "unknown";

type AuthFailureStage = "start" | "callback";

const AUTH_PROVIDER_ATTEMPT_KEY = "auth_provider_attempt";
const AUTH_PROVIDER_ATTEMPT_MAX_AGE_MS = 15 * 60 * 1000;

export function normalizeAuthProvider(value: unknown): AuthFunnelProvider {
  switch (value) {
    case "google":
    case "microsoft":
    case "apple":
    case "sso":
      return value;
    default:
      return "unknown";
  }
}

export function getAuthErrorCategory(errorCode?: string | null) {
  switch (errorCode?.toLowerCase()) {
    case "access_denied":
      return "access_denied";
    case "invalid_code":
    case "no_code":
    case "org_invite_invalid_code":
      return "invalid_or_expired_callback";
    case "email_already_linked":
    case "oauth_account_not_linked":
    case "account_not_linked":
    case "account_already_linked_to_different_user":
      return "account_conflict";
    case "requiresreconsent":
      return "reconsent_required";
    case "email_not_found":
    case "signup_not_allowed":
      return "signup_not_allowed";
    case "network_error":
      return "network_error";
    case "client_error":
      return "client_error";
    case "internal_server_error":
    case "oauth_provider_not_found":
    case "unable_to_create_user":
    case "unable_to_get_user_info":
    case "unable_to_link_account":
    case "sso_start_rejected":
      return "provider_or_server_error";
    default:
      return "unknown";
  }
}

export function rememberAuthProvider(
  provider: AuthFunnelProvider,
  startedAt = Date.now(),
) {
  withSessionStorage((storage) =>
    storage.setItem(
      AUTH_PROVIDER_ATTEMPT_KEY,
      JSON.stringify({ provider, startedAt }),
    ),
  );
}

export function getPendingAuthProvider(now = Date.now()): AuthFunnelProvider {
  const provider = withSessionStorage((storage) => {
    const storedAttempt = storage.getItem(AUTH_PROVIDER_ATTEMPT_KEY);
    if (!storedAttempt) return "unknown";

    const attempt = parseStoredAttempt(storedAttempt);
    if (
      typeof attempt?.startedAt !== "number" ||
      now - attempt.startedAt > AUTH_PROVIDER_ATTEMPT_MAX_AGE_MS
    ) {
      storage.removeItem(AUTH_PROVIDER_ATTEMPT_KEY);
      return "unknown";
    }

    return normalizeAuthProvider(attempt.provider);
  });

  return provider ?? "unknown";
}

export function clearPendingAuthProvider() {
  withSessionStorage((storage) =>
    storage.removeItem(AUTH_PROVIDER_ATTEMPT_KEY),
  );
}

export function trackAuthStarted(
  posthog: PostHog,
  provider: AuthFunnelProvider,
) {
  rememberAuthProvider(provider);
  capture(posthog, "Authentication Started", { provider });
}

export function trackAuthFailure(
  posthog: PostHog,
  options: {
    provider: AuthFunnelProvider;
    stage: AuthFailureStage;
    errorCode?: string | null;
  },
) {
  capture(posthog, "Authentication Failed", {
    provider: options.provider,
    stage: options.stage,
    error_category: getAuthErrorCategory(options.errorCode),
    error_code: getSafeAuthErrorCode(options.errorCode),
  });
  clearPendingAuthProvider();
}

// Providers can return free-form text carrying tenant, trace, or account
// identifiers, so this is an allowlist rather than a shape check: anything not
// named here is dropped. It covers the codes getAuthErrorCategory recognises
// plus ones that currently fall through to "unknown", which is where the
// category alone stops being diagnostic.
const KNOWN_AUTH_ERROR_CODES = new Set([
  "access_denied",
  "account_already_linked_to_different_user",
  "account_not_linked",
  "client_error",
  "configuration",
  "consent_required",
  "email_already_linked",
  "email_not_found",
  "internal_server_error",
  "invalid_client",
  "invalid_code",
  "network_error",
  "no_code",
  "oauth_account_not_linked",
  "oauth_provider_not_found",
  "org_invite_invalid_code",
  "please_restart_the_process",
  "requiresreconsent",
  "server_error",
  "signup_not_allowed",
  "sso_start_rejected",
  "state_mismatch",
  "unable_to_create_user",
  "unable_to_get_user_info",
  "unable_to_link_account",
]);

function getSafeAuthErrorCode(errorCode?: string | null) {
  if (!errorCode) return null;
  const normalized = errorCode.toLowerCase();
  return KNOWN_AUTH_ERROR_CODES.has(normalized) ? normalized : null;
}

// Analytics must never block authentication, including when browser storage or
// the PostHog client is unavailable.
function withSessionStorage<T>(run: (storage: Storage) => T): T | null {
  try {
    if (typeof sessionStorage === "undefined") return null;
    return run(sessionStorage);
  } catch {
    return null;
  }
}

function capture(
  posthog: PostHog,
  event: string,
  properties: Record<string, unknown>,
) {
  try {
    posthog.capture(event, properties);
  } catch {
    // See withSessionStorage.
  }
}

function parseStoredAttempt(value: string) {
  try {
    return JSON.parse(value) as { provider?: unknown; startedAt?: unknown };
  } catch {
    return null;
  }
}
