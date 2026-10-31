import "server-only";
import { randomUUID } from "node:crypto";
import type { Logger } from "@/utils/logger";
import { redis } from "@/utils/redis";
import { isEmailProviderRateLimitRedisConfigured } from "@/utils/redis/email-provider-rate-limit";
import { clearOwnedLock } from "@/utils/redis/owned-lock";

const GMAIL_HISTORY_CATCH_UP_KEY_PREFIX = "gmail-history-catch-up";
const GMAIL_HISTORY_CATCH_UP_TTL_SECONDS = 24 * 60 * 60;

// Failures only cost the wider catch-up window, so they never fail the webhook.
// Shares the rate-limit state's Redis check: without that state, webhooks never
// skip history, so there is nothing to catch up on.

/**
 * Records that webhook history was left unprocessed because Gmail was rate
 * limiting the account. Each mark gets a new token so a catch-up run only
 * clears the mark it read, not one set by a webhook skipped during that run.
 */
export async function markGmailHistoryCatchUp(
  emailAccountId: string,
  logger: Logger,
) {
  if (!isEmailProviderRateLimitRedisConfigured()) return;

  try {
    await redis.set(getGmailHistoryCatchUpKey(emailAccountId), randomUUID(), {
      ex: GMAIL_HISTORY_CATCH_UP_TTL_SECONDS,
    });
  } catch (error) {
    logger.warn("Failed to mark Gmail history catch-up", { error });
  }
}

export async function getGmailHistoryCatchUp(
  emailAccountId: string,
  logger: Logger,
): Promise<string | null> {
  if (!isEmailProviderRateLimitRedisConfigured()) return null;

  try {
    return await redis.get<string>(getGmailHistoryCatchUpKey(emailAccountId));
  } catch (error) {
    logger.warn("Failed to read Gmail history catch-up", { error });
    return null;
  }
}

export async function clearGmailHistoryCatchUp({
  emailAccountId,
  token,
  logger,
}: {
  emailAccountId: string;
  token: string;
  logger: Logger;
}) {
  if (!isEmailProviderRateLimitRedisConfigured()) return;

  try {
    await clearOwnedLock({
      key: getGmailHistoryCatchUpKey(emailAccountId),
      lockToken: token,
    });
  } catch (error) {
    logger.warn("Failed to clear Gmail history catch-up", { error });
  }
}

function getGmailHistoryCatchUpKey(emailAccountId: string) {
  return `${GMAIL_HISTORY_CATCH_UP_KEY_PREFIX}:${emailAccountId}`;
}
