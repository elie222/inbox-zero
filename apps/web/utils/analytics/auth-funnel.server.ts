import type { AuthFunnelProvider } from "@/utils/analytics/auth-funnel";
import { normalizeAuthProvider } from "@/utils/analytics/auth-funnel";
import { createScopedLogger } from "@/utils/logger";
import { posthogCaptureEvent } from "@/utils/posthog";
import prisma from "@/utils/prisma";

const logger = createScopedLogger("analytics/auth-funnel");
const NEW_USER_AUTH_WINDOW_MS = 60 * 1000;

type AuthHookContext = {
  path?: string;
  params?: Record<string, unknown>;
  context?: {
    runInBackgroundOrAwait?: (promise: Promise<unknown>) => unknown;
  };
} | null;

export function getAuthProviderFromContext(
  context: Pick<NonNullable<AuthHookContext>, "params" | "path"> | null,
): AuthFunnelProvider {
  const provider = normalizeAuthProvider(
    context?.params?.id ?? context?.params?.providerId,
  );
  if (provider !== "unknown") return provider;

  return context?.path?.includes("/sso/") ? "sso" : "unknown";
}

export async function queueAuthFunnelTracking(
  context: AuthHookContext,
  tracking: Promise<unknown>,
) {
  const runInBackground = context?.context?.runInBackgroundOrAwait;
  if (runInBackground) {
    await runInBackground(tracking);
    return;
  }

  await tracking;
}

export async function trackAuthenticationCompleted({
  userId,
  provider,
  authenticatedAt,
}: {
  userId: string;
  provider: AuthFunnelProvider;
  authenticatedAt: Date;
}) {
  if (provider === "unknown") return;

  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { createdAt: true, email: true },
    });
    if (!user) return;

    const accountAgeAtAuthentication =
      authenticatedAt.getTime() - user.createdAt.getTime();
    await posthogCaptureEvent(user.email, "Authentication Completed", {
      provider,
      is_new_user:
        accountAgeAtAuthentication >= 0 &&
        accountAgeAtAuthentication <= NEW_USER_AUTH_WINDOW_MS,
    });
  } catch (error) {
    logger.error("Failed to track completed authentication", {
      error,
      userId,
      provider,
    });
  }
}
