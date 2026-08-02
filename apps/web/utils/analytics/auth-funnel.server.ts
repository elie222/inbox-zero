import type { GenericEndpointContext } from "better-auth";
import type { AuthFunnelProvider } from "@/utils/analytics/auth-funnel";
import { normalizeAuthProvider } from "@/utils/analytics/auth-funnel";
import { createScopedLogger } from "@/utils/logger";
import { posthogCaptureEvent } from "@/utils/posthog";

const logger = createScopedLogger("analytics/auth-funnel");
const newUserAuthContexts = new WeakSet<object>();

export function markAuthContextAsNewUser(authContext?: object | null) {
  if (authContext) newUserAuthContexts.add(authContext);
}

export function isNewUserAuthContext(authContext?: object | null) {
  return !!authContext && newUserAuthContexts.has(authContext);
}

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
  provider,
  isNewUser,
}: {
  email: string;
  provider: AuthFunnelProvider;
  isNewUser: boolean;
}) {
  if (provider === "unknown") return;

  try {
    await posthogCaptureEvent(email, "Authentication Completed", {
      provider,
      is_new_user: isNewUser,
    });
  } catch (error) {
    logger.error("Failed to track completed authentication", {
      error,
      provider,
    });
  }
}
