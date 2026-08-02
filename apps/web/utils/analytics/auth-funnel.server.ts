import type { GenericEndpointContext } from "better-auth";
import type { AuthFunnelProvider } from "@/utils/analytics/auth-funnel";
import { normalizeAuthProvider } from "@/utils/analytics/auth-funnel";
import { createScopedLogger } from "@/utils/logger";
import { posthogCaptureEvent } from "@/utils/posthog";

const logger = createScopedLogger("analytics/auth-funnel");
const NEW_USER_AUTH_WINDOW_MS = 60 * 1000;

export function getAuthProviderFromContext(
  context: Pick<GenericEndpointContext, "params" | "path"> | null,
): AuthFunnelProvider {
  const provider = normalizeAuthProvider(
    context?.params?.id ?? context?.params?.providerId,
  );
  if (provider !== "unknown") return provider;

  return context?.path?.includes("/sso/") ? "sso" : "unknown";
}

export async function trackAuthenticationCompleted({
  email,
  userCreatedAt,
  provider,
  authenticatedAt,
}: {
  email: string;
  userCreatedAt: Date;
  provider: AuthFunnelProvider;
  authenticatedAt: Date;
}) {
  if (provider === "unknown") return;

  try {
    const accountAgeAtAuthentication =
      authenticatedAt.getTime() - userCreatedAt.getTime();

    await posthogCaptureEvent(email, "Authentication Completed", {
      provider,
      is_new_user:
        accountAgeAtAuthentication >= 0 &&
        accountAgeAtAuthentication <= NEW_USER_AUTH_WINDOW_MS,
    });
  } catch (error) {
    logger.error("Failed to track completed authentication", {
      error,
      provider,
    });
  }
}
