import { Client } from "@upstash/qstash";
import { env } from "@/env";
import { SnoozedThreadStatus } from "@/generated/prisma/enums";
import { getCronSecretHeader } from "@/utils/cron";
import { getInternalApiUrl } from "@/utils/internal-api";
import { createScopedLogger } from "@/utils/logger";
import prisma from "@/utils/prisma";

const logger = createScopedLogger("snoozed-threads");
export const SNOOZE_EXECUTION_LEASE_MS = 15 * 60 * 1000;
const SNOOZE_RETRY_DELAY_MS = 5 * 60 * 1000;

export async function scheduleSnoozedThread({
  emailAccountId,
  scheduledFor,
  threadId,
}: {
  emailAccountId: string;
  scheduledFor: Date;
  threadId: string;
}) {
  const pendingSnooze = {
    emailAccountId,
    threadId,
    status: SnoozedThreadStatus.PENDING,
  };
  const [replacedSnoozes, , snoozedThread] = await prisma.$transaction([
    prisma.snoozedThread.findMany({
      where: pendingSnooze,
      select: { id: true },
    }),
    prisma.snoozedThread.updateMany({
      where: pendingSnooze,
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

  await cancelQstashMessages(
    client,
    replacedSnoozes.map(({ id }) => id),
  );

  const schedulerLabel = getSchedulerLabel(snoozedThread.id);
  try {
    await client.publishJSON({
      url: `${getInternalApiUrl()}/api/snoozed-threads/execute`,
      body: { snoozedThreadId: snoozedThread.id },
      notBefore: Math.ceil(scheduledFor.getTime() / 1000),
      deduplicationId: schedulerLabel,
      contentBasedDeduplication: false,
      headers: getCronSecretHeader(),
      label: schedulerLabel,
    });
  } catch (error) {
    logger.error("QStash scheduling failed; using cron fallback", {
      error,
      snoozedThreadId: snoozedThread.id,
    });
  }

  try {
    const isStillPending = await prisma.snoozedThread.count({
      where: {
        id: snoozedThread.id,
        status: SnoozedThreadStatus.PENDING,
      },
    });
    if (!isStillPending) {
      await cancelQstashMessages(client, [snoozedThread.id]);
    }
  } catch (error) {
    logger.warn("Failed to reconcile snoozed thread scheduling", {
      error,
      snoozedThreadId: snoozedThread.id,
    });
  }

  return snoozedThread;
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
        {
          status: SnoozedThreadStatus.PENDING,
          scheduledFor: { lte: now },
        },
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
  now = new Date(),
) {
  await prisma.snoozedThread.updateMany({
    where: {
      id,
      status: SnoozedThreadStatus.EXECUTING,
      updatedAt: leaseStartedAt,
    },
    data: {
      scheduledFor: new Date(now.getTime() + SNOOZE_RETRY_DELAY_MS),
      status: SnoozedThreadStatus.PENDING,
    },
  });
}

function getQstashClient() {
  if (!env.QSTASH_TOKEN) return null;
  return new Client({ token: env.QSTASH_TOKEN });
}

async function cancelQstashMessages(
  client: InstanceType<typeof Client>,
  snoozedThreadIds: string[],
) {
  if (!snoozedThreadIds.length) return;

  try {
    const result = await client.messages.cancel({
      filter: {
        label: snoozedThreadIds.map(getSchedulerLabel),
      },
    });
    logger.info("Cancelled superseded snooze deliveries", {
      cancelled: result.cancelled,
      snoozedThreadIds,
    });
  } catch (error) {
    logger.warn("Failed to cancel superseded snooze deliveries", {
      error,
      snoozedThreadIds,
    });
  }
}

function getSchedulerLabel(snoozedThreadId: string) {
  return `snoozed-thread-${snoozedThreadId}`;
}
