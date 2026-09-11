import "server-only";
import { env } from "@/env";
import { redis } from "@/utils/redis";

const PROVIDER_ISSUE_CLEANUP_KEY_PREFIX = "provider-issue-cleanup";
const PROVIDER_ISSUE_CLEANUP_DEDUPE_TTL_SECONDS = 15 * 60;

export async function claimProviderIssueCleanupInRedis({
  emailAccountId,
  reason,
}: {
  emailAccountId: string;
  reason: string;
}) {
  if (!isProviderIssueCleanupRedisConfigured()) return true;

  const claimed = await redis.set(
    getProviderIssueCleanupKey({ emailAccountId, reason }),
    "1",
    {
      nx: true,
      ex: PROVIDER_ISSUE_CLEANUP_DEDUPE_TTL_SECONDS,
    },
  );

  return claimed === "OK";
}

export async function releaseProviderIssueCleanupClaimInRedis({
  emailAccountId,
  reason,
}: {
  emailAccountId: string;
  reason: string;
}) {
  if (!isProviderIssueCleanupRedisConfigured()) return;

  await redis.del(getProviderIssueCleanupKey({ emailAccountId, reason }));
}

function isProviderIssueCleanupRedisConfigured() {
  return (
    env.NODE_ENV === "test" ||
    Boolean(env.UPSTASH_REDIS_URL && env.UPSTASH_REDIS_TOKEN)
  );
}

function getProviderIssueCleanupKey({
  emailAccountId,
  reason,
}: {
  emailAccountId: string;
  reason: string;
}) {
  return `${PROVIDER_ISSUE_CLEANUP_KEY_PREFIX}:${emailAccountId}:${reason}`;
}
