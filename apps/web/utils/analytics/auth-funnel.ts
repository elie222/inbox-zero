import type { PostHog } from "posthog-js";

export type AuthFunnelProvider =
  | "google"
  | "microsoft"
  | "apple"
  | "sso"
  | "unknown";

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
  if (typeof sessionStorage === "undefined") return;

  try {
    sessionStorage.setItem(
      AUTH_PROVIDER_ATTEMPT_KEY,
      JSON.stringify({ provider, startedAt }),
    );
  } catch {
    // Analytics must never block authentication when browser storage is unavailable.
  }
}

export function getPendingAuthProvider(now = Date.now()): AuthFunnelProvider {
  if (typeof sessionStorage === "undefined") return "unknown";

  try {
    const storedAttempt = sessionStorage.getItem(AUTH_PROVIDER_ATTEMPT_KEY);
    if (!storedAttempt) return "unknown";

    const parsed = JSON.parse(storedAttempt) as {
      provider?: unknown;
      startedAt?: unknown;
    };
    if (
      typeof parsed.startedAt !== "number" ||
      now - parsed.startedAt > AUTH_PROVIDER_ATTEMPT_MAX_AGE_MS
    ) {
      sessionStorage.removeItem(AUTH_PROVIDER_ATTEMPT_KEY);
      return "unknown";
    }

    return normalizeAuthProvider(parsed.provider);
  } catch {
    clearPendingAuthProvider();
    return "unknown";
  }
}

export function trackAuthStarted(
  posthog: PostHog,
  provider: AuthFunnelProvider,
) {
  rememberAuthProvider(provider);
  try {
    posthog.capture("Authentication Started", { provider });
  } catch {
    // Analytics must never block authentication.
  }
}

export function trackAuthFailure(
  posthog: PostHog,
  options: {
    provider: AuthFunnelProvider;
    stage: AuthFailureStage;
    errorCode?: string | null;
  },
) {
  try {
    posthog.capture("Authentication Failed", {
      provider: options.provider,
      stage: options.stage,
      error_category: getAuthErrorCategory(options.errorCode),
    });
  } catch {
    // Analytics must never block authentication.
  }
  clearPendingAuthProvider();
}

function clearPendingAuthProvider() {
  if (typeof sessionStorage === "undefined") return;

  try {
    sessionStorage.removeItem(AUTH_PROVIDER_ATTEMPT_KEY);
  } catch {
    // Ignore unavailable browser storage.
  }
}
