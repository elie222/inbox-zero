import prisma from "@/utils/prisma";
import type { Logger } from "@/utils/logger";
import { acquireOwnedLock, clearOwnedLock } from "@/utils/redis/owned-lock";
import { sleep } from "@/utils/sleep";
import { SafeError } from "@/utils/error";

const TOKEN_REFRESH_LOCK_TTL_SECONDS = 30;
const TOKEN_REFRESH_WAIT_TIMEOUT_MS = 10_000;
const TOKEN_REFRESH_WAIT_INTERVAL_MS = 500;

export type TokenRefreshProvider = "google" | "microsoft";

export type EmailAccountTokenSnapshot = {
  accessToken: string | null;
  refreshToken: string | null;
  expiresAt: number | null;
};

export type TokenRefreshLockResult =
  | { status: "acquired"; lockToken: string }
  | { status: "busy" }
  | { status: "unavailable" };

export class TokenRefreshInProgressError extends SafeError {
  constructor() {
    super(
      "Email account authorization is refreshing. Please retry shortly.",
      503,
    );
  }
}

export function isEmailAccountTokenFresh({
  accessToken,
  expiresAt,
  bufferMs = 0,
}: EmailAccountTokenSnapshot & { bufferMs?: number }) {
  return !!accessToken && !!expiresAt && expiresAt > Date.now() + bufferMs;
}

export async function acquireEmailAccountTokenRefreshLock({
  emailAccountId,
  provider,
  logger,
}: {
  emailAccountId: string;
  provider: TokenRefreshProvider;
  logger: Logger;
}): Promise<TokenRefreshLockResult> {
  try {
    const lockToken = await acquireOwnedLock({
      key: getEmailAccountTokenRefreshLockKey({ emailAccountId, provider }),
      processingTtlSeconds: TOKEN_REFRESH_LOCK_TTL_SECONDS,
    });

    return lockToken ? { status: "acquired", lockToken } : { status: "busy" };
  } catch (error) {
    logger.warn("Failed to acquire OAuth token refresh lock", {
      emailAccountId,
      provider,
      error: error instanceof Error ? error.message : error,
    });
    return { status: "unavailable" };
  }
}

export async function clearEmailAccountTokenRefreshLock({
  emailAccountId,
  provider,
  lockToken,
  logger,
}: {
  emailAccountId: string;
  provider: TokenRefreshProvider;
  lockToken: string | null;
  logger: Logger;
}) {
  if (!lockToken) return;

  try {
    await clearOwnedLock({
      key: getEmailAccountTokenRefreshLockKey({ emailAccountId, provider }),
      lockToken,
    });
  } catch (error) {
    logger.warn("Failed to clear OAuth token refresh lock", {
      emailAccountId,
      provider,
      error: error instanceof Error ? error.message : error,
    });
  }
}

export async function getCurrentEmailAccountTokens(emailAccountId: string) {
  const emailAccount = await prisma.emailAccount.findUnique({
    where: { id: emailAccountId },
    select: {
      account: {
        select: {
          access_token: true,
          refresh_token: true,
          expires_at: true,
        },
      },
    },
  });

  return toTokenSnapshot(emailAccount?.account);
}

export async function waitForFreshEmailAccountTokens({
  emailAccountId,
  bufferMs = 0,
  timeoutMs = TOKEN_REFRESH_WAIT_TIMEOUT_MS,
  intervalMs = TOKEN_REFRESH_WAIT_INTERVAL_MS,
}: {
  emailAccountId: string;
  bufferMs?: number;
  timeoutMs?: number;
  intervalMs?: number;
}) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() <= deadline) {
    const tokens = await getCurrentEmailAccountTokens(emailAccountId);
    if (isEmailAccountTokenFresh({ ...tokens, bufferMs })) {
      return tokens;
    }

    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0) break;

    await sleep(Math.min(intervalMs, remainingMs));
  }

  return null;
}

function getEmailAccountTokenRefreshLockKey({
  emailAccountId,
  provider,
}: {
  emailAccountId: string;
  provider: TokenRefreshProvider;
}) {
  return `oauth-token-refresh:${provider}:${emailAccountId}`;
}

function toTokenSnapshot(
  account?: {
    access_token: string | null;
    refresh_token: string | null;
    expires_at: Date | null;
  } | null,
): EmailAccountTokenSnapshot {
  return {
    accessToken: account?.access_token ?? null,
    refreshToken: account?.refresh_token ?? null,
    expiresAt: account?.expires_at?.getTime() ?? null,
  };
}
