import { randomUUID } from "node:crypto";
import prisma from "@/utils/prisma";
import { redis } from "@/utils/redis";

const DIGEST_SUMMARY_WINDOW_MS = 24 * 60 * 60 * 1000;
const DIGEST_SUMMARY_WINDOW_TTL_SECONDS = 24 * 60 * 60;
const DIGEST_SUMMARY_LIMIT_KEY_PREFIX = "digest:summary-limit";
const RESERVE_DIGEST_SUMMARY_SLOT_SCRIPT = `
redis.call("ZREMRANGEBYSCORE", KEYS[1], "-inf", "(" .. ARGV[2])
local count = redis.call("ZCARD", KEYS[1])
if count >= tonumber(ARGV[3]) then
  return 0
end
redis.call("ZADD", KEYS[1], ARGV[1], ARGV[4])
redis.call("EXPIRE", KEYS[1], ARGV[5])
return 1
`;

export function getDigestSummaryWindowStart(now = new Date()): Date {
  return new Date(now.getTime() - DIGEST_SUMMARY_WINDOW_MS);
}

export async function reserveDigestSummarySlot({
  emailAccountId,
  maxSummariesPer24h,
  now = new Date(),
}: {
  emailAccountId: string;
  maxSummariesPer24h: number;
  now?: Date;
}): Promise<boolean> {
  if (maxSummariesPer24h <= 0) return true;

  const windowStart = getDigestSummaryWindowStart(now).getTime();
  const nowMs = now.getTime();
  const reservationId = `${nowMs}:${randomUUID()}`;

  try {
    const reserved = await redis.eval<number>(
      RESERVE_DIGEST_SUMMARY_SLOT_SCRIPT,
      [getDigestSummaryLimitKey(emailAccountId)],
      [
        nowMs.toString(),
        windowStart.toString(),
        maxSummariesPer24h.toString(),
        reservationId,
        DIGEST_SUMMARY_WINDOW_TTL_SECONDS.toString(),
      ],
    );

    return reserved === 1;
  } catch {
    return !(await hasReachedDigestSummaryLimit({
      emailAccountId,
      maxSummariesPer24h,
      now,
    }));
  }
}

export async function hasReachedDigestSummaryLimit({
  emailAccountId,
  maxSummariesPer24h,
  now = new Date(),
}: {
  emailAccountId: string;
  maxSummariesPer24h: number;
  now?: Date;
}): Promise<boolean> {
  if (maxSummariesPer24h <= 0) return false;

  const summariesInWindow = await countDigestSummariesInWindow({
    emailAccountId,
    now,
  });

  return summariesInWindow >= maxSummariesPer24h;
}

async function countDigestSummariesInWindow({
  emailAccountId,
  now,
}: {
  emailAccountId: string;
  now: Date;
}) {
  return prisma.digestItem.count({
    where: {
      digest: {
        emailAccountId,
      },
      createdAt: {
        gte: getDigestSummaryWindowStart(now),
      },
    },
  });
}

function getDigestSummaryLimitKey(emailAccountId: string) {
  return `${DIGEST_SUMMARY_LIMIT_KEY_PREFIX}:${emailAccountId}`;
}
