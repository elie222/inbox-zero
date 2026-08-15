import { randomUUID } from "node:crypto";
import { Client } from "@upstash/qstash";
import { env } from "@/env";
import { SnoozedThreadStatus } from "@/generated/prisma/enums";
import { getCronSecretHeader } from "@/utils/cron";
import { getInternalApiUrl } from "@/utils/internal-api";
import { createScopedLogger } from "@/utils/logger";
import prisma from "@/utils/prisma";

const logger = createScopedLogger("snoozed-threads");
export const SNOOZE_EXECUTION_LEASE_MS = 15 * 60 * 1000;

function getQstashClient() {
  if (!env.QSTASH_TOKEN) return null;
  return new Client({ token: env.QSTASH_TOKEN });
}

export async function scheduleSnoozedThread({
  emailAccountId,
  scheduledFor,
  threadId,
}: {
  emailAccountId: string;
  scheduledFor: Date;
  threadId: string;
}) {
  const existing = await prisma.snoozedThread.findMany({
    where: {
      emailAccountId,
      threadId,
      status: SnoozedThreadStatus.PENDING,
    },
    orderBy: { createdAt: "desc" },
  });

  const snoozedThread = await prisma.snoozedThread.create({
    data: {
      emailAccountId,
      scheduledFor,
      status: SnoozedThreadStatus.PREPARING,
      threadId,
    },
  });

  const client = getQstashClient();
  let preparedSnooze = snoozedThread;
  if (!client) {
    logger.info("QStash unavailable; snoozed thread will use cron fallback", {
      snoozedThreadId: snoozedThread.id,
      scheduledFor,
    });
  } else {
    try {
      const response = await client.publishJSON({
        url: `${getInternalApiUrl()}/api/snoozed-threads/execute`,
        body: { snoozedThreadId: snoozedThread.id },
        notBefore: Math.ceil(scheduledFor.getTime() / 1000),
        deduplicationId: `snoozed-thread-${snoozedThread.id}`,
        contentBasedDeduplication: false,
        headers: getCronSecretHeader(),
      });
      const scheduledId =
        "messageId" in response ? response.messageId : undefined;
      preparedSnooze = await prisma.snoozedThread.update({
        where: { id: snoozedThread.id },
        data: {
          scheduledId,
          schedulingStatus: "SCHEDULED",
        },
      });
    } catch (error) {
      await failPreparedSnooze(snoozedThread.id);
      logger.error("Failed to schedule snoozed thread", {
        error,
        snoozedThreadId: snoozedThread.id,
      });
      throw error;
    }
  }

  try {
    const [, activatedSnooze] = await prisma.$transaction([
      prisma.snoozedThread.updateMany({
        where: {
          emailAccountId,
          threadId,
          status: SnoozedThreadStatus.PENDING,
        },
        data: { status: SnoozedThreadStatus.CANCELLED },
      }),
      prisma.snoozedThread.update({
        where: { id: preparedSnooze.id },
        data: { status: SnoozedThreadStatus.PENDING },
      }),
    ]);

    await Promise.all(
      existing.map(({ id, scheduledId }) =>
        deleteScheduledMessage({ id, scheduledId }),
      ),
    );
    return activatedSnooze;
  } catch (error) {
    await failPreparedSnooze(preparedSnooze.id);
    await deleteScheduledMessage({
      id: preparedSnooze.id,
      scheduledId: preparedSnooze.scheduledId,
    });
    logger.error("Failed to schedule snoozed thread", {
      error,
      snoozedThreadId: preparedSnooze.id,
    });
    throw error;
  }
}

export async function cancelSnoozedThread({
  id,
  scheduledId,
}: {
  id: string;
  scheduledId: string | null;
}) {
  const cancelled = await prisma.snoozedThread.updateMany({
    where: { id, status: SnoozedThreadStatus.PENDING },
    data: { status: SnoozedThreadStatus.CANCELLED },
  });
  if (cancelled.count !== 1) return false;

  const client = getQstashClient();
  if (!client || !scheduledId) return true;

  await deleteScheduledMessage({ id, scheduledId });
  return true;
}

export async function markSnoozedThreadAsExecuting(
  id: string,
  now = new Date(),
) {
  const staleBefore = new Date(now.getTime() - SNOOZE_EXECUTION_LEASE_MS);
  const executionToken = randomUUID();
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
    data: { executionToken, status: SnoozedThreadStatus.EXECUTING },
  });
  return updated.count === 1 ? executionToken : null;
}

export async function releaseSnoozedThreadForRetry(
  id: string,
  executionToken: string,
) {
  await prisma.snoozedThread.updateMany({
    where: {
      executionToken,
      id,
      status: SnoozedThreadStatus.EXECUTING,
    },
    data: {
      executionToken: null,
      status: SnoozedThreadStatus.PENDING,
    },
  });
}

async function failPreparedSnooze(id: string) {
  await prisma.snoozedThread.updateMany({
    where: { id, status: SnoozedThreadStatus.PREPARING },
    data: {
      schedulingStatus: "FAILED",
      status: SnoozedThreadStatus.FAILED,
    },
  });
}

async function deleteScheduledMessage({
  id,
  scheduledId,
}: {
  id: string;
  scheduledId: string | null;
}) {
  const client = getQstashClient();
  if (!client || !scheduledId) return;

  try {
    await client.http.request({
      path: ["v2", "messages", scheduledId],
      method: "DELETE",
    });
  } catch (error) {
    logger.warn("Failed to remove cancelled snooze from QStash", {
      error,
      snoozedThreadId: id,
    });
  }
}
