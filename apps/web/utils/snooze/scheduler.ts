import { Client } from "@upstash/qstash";
import { env } from "@/env";
import { SnoozedThreadStatus } from "@/generated/prisma/enums";
import { getCronSecretHeader } from "@/utils/cron";
import { getInternalApiUrl } from "@/utils/internal-api";
import { createScopedLogger } from "@/utils/logger";
import prisma from "@/utils/prisma";

const logger = createScopedLogger("snoozed-threads");
export const SNOOZE_EXECUTION_LEASE_MS = 15 * 60 * 1000;

export async function scheduleSnoozedThread({
  emailAccountId,
  scheduledFor,
  threadId,
}: {
  emailAccountId: string;
  scheduledFor: Date;
  threadId: string;
}) {
  const [, snoozedThread] = await prisma.$transaction([
    prisma.snoozedThread.updateMany({
      where: {
        emailAccountId,
        threadId,
        status: SnoozedThreadStatus.PENDING,
      },
      data: { status: SnoozedThreadStatus.CANCELLED },
    }),
    prisma.snoozedThread.create({
      data: { emailAccountId, scheduledFor, threadId },
    }),
  ]);

  const client = getQstashClient();
  if (!client) {
    logger.info("QStash unavailable; snoozed thread will use cron fallback", {
      snoozedThreadId: snoozedThread.id,
      scheduledFor,
    });
    return snoozedThread;
  }

  try {
    await client.publishJSON({
      url: `${getInternalApiUrl()}/api/snoozed-threads/execute`,
      body: { snoozedThreadId: snoozedThread.id },
      notBefore: Math.ceil(scheduledFor.getTime() / 1000),
      deduplicationId: `snoozed-thread-${snoozedThread.id}`,
      contentBasedDeduplication: false,
      headers: getCronSecretHeader(),
    });
  } catch (error) {
    logger.error("QStash scheduling failed; using cron fallback", {
      error,
      snoozedThreadId: snoozedThread.id,
    });
  }

  return snoozedThread;
}

export async function cancelSnoozedThread(id: string) {
  const cancelled = await prisma.snoozedThread.updateMany({
    where: { id, status: SnoozedThreadStatus.PENDING },
    data: { status: SnoozedThreadStatus.CANCELLED },
  });
  return cancelled.count === 1;
}

export async function markSnoozedThreadAsExecuting(
  id: string,
  now = new Date(),
) {
  const staleBefore = new Date(now.getTime() - SNOOZE_EXECUTION_LEASE_MS);
  const updated = await prisma.snoozedThread.updateMany({
    where: {
      id,
      OR: [
        { status: SnoozedThreadStatus.PENDING },
        {
          status: SnoozedThreadStatus.EXECUTING,
          updatedAt: { lte: staleBefore },
        },
      ],
    },
    data: { status: SnoozedThreadStatus.EXECUTING, updatedAt: now },
  });
  return updated.count === 1 ? now : null;
}

export async function releaseSnoozedThreadForRetry(
  id: string,
  leaseStartedAt: Date,
) {
  await prisma.snoozedThread.updateMany({
    where: {
      id,
      status: SnoozedThreadStatus.EXECUTING,
      updatedAt: leaseStartedAt,
    },
    data: { status: SnoozedThreadStatus.PENDING },
  });
}

function getQstashClient() {
  if (!env.QSTASH_TOKEN) return null;
  return new Client({ token: env.QSTASH_TOKEN });
}
