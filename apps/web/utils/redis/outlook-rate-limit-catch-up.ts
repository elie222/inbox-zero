import "server-only";
import type { Logger } from "@/utils/logger";
import { redis } from "@/utils/redis";
import { isEmailProviderRateLimitRedisConfigured } from "@/utils/redis/email-provider-rate-limit";

const OUTLOOK_RATE_LIMIT_CATCH_UP_KEY_PREFIX = "outlook-rate-limit-catch-up";
const OUTLOOK_RATE_LIMIT_CATCH_UP_TTL_SECONDS = 24 * 60 * 60;

// ISO timestamps sort lexically, so keeping the smaller value keeps the start
// of the skipped window when skips and a failed catch-up both write the mark.
const SET_IF_EARLIER_SCRIPT = `
local current = redis.call("GET", KEYS[1])
if current and current <= ARGV[1] then
  return 0
end
redis.call("SET", KEYS[1], ARGV[1], "EX", tonumber(ARGV[2]))
return 1
`;

// Failures only lose the catch-up, so they never fail the webhook. Without the
// rate-limit state in Redis, notifications are never skipped for rate limits.

/**
 * Records that Outlook notifications from `since` onward were left
 * unprocessed because Microsoft was rate limiting the account.
 */
export async function markOutlookRateLimitCatchUp({
  emailAccountId,
  since,
  logger,
}: {
  emailAccountId: string;
  since: Date;
  logger: Logger;
}) {
  if (!isEmailProviderRateLimitRedisConfigured()) return;

  try {
    await redis.eval<string[], number>(
      SET_IF_EARLIER_SCRIPT,
      [getOutlookRateLimitCatchUpKey(emailAccountId)],
      [since.toISOString(), OUTLOOK_RATE_LIMIT_CATCH_UP_TTL_SECONDS.toString()],
    );
  } catch (error) {
    logger.warn("Failed to mark Outlook rate-limit catch-up", { error });
  }
}

/**
 * Claims the pending catch-up, if any. Removing the mark as it is read means
 * only one of the notifications arriving after the cooldown runs it.
 */
export async function takeOutlookRateLimitCatchUp(
  emailAccountId: string,
  logger: Logger,
): Promise<Date | null> {
  if (!isEmailProviderRateLimitRedisConfigured()) return null;

  try {
    const since = await redis.getdel<string>(
      getOutlookRateLimitCatchUpKey(emailAccountId),
    );
    if (!since) return null;

    const date = new Date(since);
    return Number.isNaN(date.getTime()) ? null : date;
  } catch (error) {
    logger.warn("Failed to read Outlook rate-limit catch-up", { error });
    return null;
  }
}

function getOutlookRateLimitCatchUpKey(emailAccountId: string) {
  return `${OUTLOOK_RATE_LIMIT_CATCH_UP_KEY_PREFIX}:${emailAccountId}`;
}
