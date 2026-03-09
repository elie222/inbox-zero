import { randomUUID } from "node:crypto";
import { DigestStatus } from "@/generated/prisma/enums";
import prisma from "@/utils/prisma";
import { redis } from "@/utils/redis";

const DIGEST_SUMMARY_WINDOW_MS = 24 * 60 * 60 * 1000;
const DIGEST_SUMMARY_WINDOW_TTL_SECONDS = 24 * 60 * 60;
const DIGEST_SUMMARY_LIMIT_KEY_PREFIX = "digest:summary-limit";
const DIGEST_SUMMARY_RESERVATION_CONTENT = "__digest_summary_reservation__";
const DIGEST_SUMMARY_RESERVATION_PREFIX = "digest-summary-reservation";
const RESERVE_DIGEST_SUMMARY_SLOT_SCRIPT = `
redis.call("ZREMRANGEBYSCORE", KEYS[1], "-inf", "(" .. ARGV[2])
local activeCount = redis.call("ZCARD", KEYS[1])
if activeCount >= tonumber(ARGV[3]) then
  return 0
end
redis.call("ZADD", KEYS[1], ARGV[1], ARGV[4])
redis.call("EXPIRE", KEYS[1], ARGV[5])
return 1
`.trim();

export function getDigestSummaryWindowStart(now = new Date()): Date {
  return new Date(now.getTime() - DIGEST_SUMMARY_WINDOW_MS);
}

export type DigestSummarySlotReservation = {
  reserved: boolean;
  reservationId: string | null;
  reservationSource: "redis" | "prisma" | null;
};

export async function reserveDigestSummarySlot({
  emailAccountId,
  maxSummariesPer24h,
  now = new Date(),
}: {
  emailAccountId: string;
  maxSummariesPer24h: number;
  now?: Date;
}): Promise<DigestSummarySlotReservation> {
  if (maxSummariesPer24h <= 0) {
    return { reserved: true, reservationId: null, reservationSource: null };
  }

  const windowStart = getDigestSummaryWindowStart(now).getTime();
  const nowMs = now.getTime();
  const reservationId = `${nowMs}:${randomUUID()}`;

  try {
    const reserved = await runReserveDigestSummarySlotScript({
      key: getDigestSummaryLimitKey(emailAccountId),
      nowMs,
      windowStartMs: windowStart,
      maxSummariesPer24h,
      reservationId,
      ttlSeconds: DIGEST_SUMMARY_WINDOW_TTL_SECONDS,
    });

    return {
      reserved,
      reservationId: reserved ? reservationId : null,
      reservationSource: reserved ? "redis" : null,
    };
  } catch {
    const fallbackReservationId = await reserveDigestSummarySlotWithPrisma({
      emailAccountId,
      maxSummariesPer24h,
      now,
    }).catch(() => null);

    return {
      reserved: !!fallbackReservationId,
      reservationId: fallbackReservationId,
      reservationSource: fallbackReservationId ? "prisma" : null,
    };
  }
}

export async function releaseDigestSummarySlot({
  emailAccountId,
  reservationId,
  reservationSource,
}: {
  emailAccountId: string;
  reservationId: string;
  reservationSource: "redis" | "prisma" | null;
}): Promise<boolean> {
  if (reservationSource === "redis") {
    const removedCount = await redis.zrem(
      getDigestSummaryLimitKey(emailAccountId),
      reservationId,
    );
    return removedCount === 1;
  }

  if (reservationSource === "prisma") {
    const removedCount = await prisma.digestItem.deleteMany({
      where: {
        id: reservationId,
        content: DIGEST_SUMMARY_RESERVATION_CONTENT,
        digest: {
          emailAccountId,
        },
      },
    });
    return removedCount.count === 1;
  }

  return false;
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

async function runReserveDigestSummarySlotScript({
  key,
  nowMs,
  windowStartMs,
  maxSummariesPer24h,
  reservationId,
  ttlSeconds,
}: {
  key: string;
  nowMs: number;
  windowStartMs: number;
  maxSummariesPer24h: number;
  reservationId: string;
  ttlSeconds: number;
}) {
  const result = await redis.eval<string[], number>(
    RESERVE_DIGEST_SUMMARY_SLOT_SCRIPT,
    [key],
    [
      nowMs.toString(),
      windowStartMs.toString(),
      maxSummariesPer24h.toString(),
      reservationId,
      ttlSeconds.toString(),
    ],
  );

  return result === 1;
}

async function reserveDigestSummarySlotWithPrisma({
  emailAccountId,
  maxSummariesPer24h,
  now,
}: {
  emailAccountId: string;
  maxSummariesPer24h: number;
  now: Date;
}) {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`
      SELECT pg_advisory_xact_lock(hashtext(${emailAccountId}))
    `;

    const summariesInWindow = await tx.digestItem.count({
      where: {
        digest: {
          emailAccountId,
        },
        createdAt: {
          gte: getDigestSummaryWindowStart(now),
        },
      },
    });

    if (summariesInWindow >= maxSummariesPer24h) return null;

    const pendingDigest = await tx.digest.findFirst({
      where: {
        emailAccountId,
        status: DigestStatus.PENDING,
      },
      orderBy: {
        createdAt: "asc",
      },
      select: {
        id: true,
      },
    });

    const digestId =
      pendingDigest?.id ||
      (
        await tx.digest.create({
          data: {
            emailAccountId,
            status: DigestStatus.PENDING,
          },
          select: {
            id: true,
          },
        })
      ).id;

    const reservationToken = randomUUID();
    const reservation = await tx.digestItem.create({
      data: {
        digestId,
        messageId: getPrismaReservationMessageId(reservationToken),
        threadId: getPrismaReservationThreadId(reservationToken),
        content: DIGEST_SUMMARY_RESERVATION_CONTENT,
      },
      select: {
        id: true,
      },
    });

    return reservation.id;
  });
}

function getPrismaReservationMessageId(reservationToken: string) {
  return `${DIGEST_SUMMARY_RESERVATION_PREFIX}:message:${reservationToken}`;
}

function getPrismaReservationThreadId(reservationToken: string) {
  return `${DIGEST_SUMMARY_RESERVATION_PREFIX}:thread:${reservationToken}`;
}
