import "server-only";
import { env } from "@/env";
import type { Logger } from "@/utils/logger";
import { redis } from "@/utils/redis";

const GMAIL_HISTORY_CATCH_UP_KEY_PREFIX = "gmail-history-catch-up";
const GMAIL_HISTORY_CATCH_UP_TTL_SECONDS = 24 * 60 * 60;

// Failures only cost the wider catch-up window, so they never fail the webhook.

/** Records that webhook history was left unprocessed because Gmail was rate limiting the account. */
export async function markGmailHistoryCatchUp(
  emailAccountId: string,
  logger: Logger,
) {
  if (!isGmailHistoryCatchUpRedisConfigured()) return;

  try {
    await redis.set(getGmailHistoryCatchUpKey(emailAccountId), "1", {
      ex: GMAIL_HISTORY_CATCH_UP_TTL_SECONDS,
    });
  } catch (error) {
    logger.warn("Failed to mark Gmail history catch-up", { error });
  }
}

export async function hasGmailHistoryCatchUp(
  emailAccountId: string,
  logger: Logger,
) {
  if (!isGmailHistoryCatchUpRedisConfigured()) return false;

  try {
    return !!(await redis.get(getGmailHistoryCatchUpKey(emailAccountId)));
  } catch (error) {
    logger.warn("Failed to read Gmail history catch-up", { error });
    return false;
  }
}

export async function clearGmailHistoryCatchUp(
  emailAccountId: string,
  logger: Logger,
) {
  if (!isGmailHistoryCatchUpRedisConfigured()) return;

  try {
    await redis.del(getGmailHistoryCatchUpKey(emailAccountId));
  } catch (error) {
    logger.warn("Failed to clear Gmail history catch-up", { error });
  }
}

function isGmailHistoryCatchUpRedisConfigured() {
  return (
    env.NODE_ENV === "test" ||
    Boolean(env.REDIS_HTTP_URL && env.REDIS_HTTP_TOKEN)
  );
}

function getGmailHistoryCatchUpKey(emailAccountId: string) {
  return `${GMAIL_HISTORY_CATCH_UP_KEY_PREFIX}:${emailAccountId}`;
}
