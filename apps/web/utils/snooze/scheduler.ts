import { Client } from "@upstash/qstash";
import { getUnixTime } from "date-fns";
import { env } from "@/env";
import { SnoozedThreadStatus } from "@/generated/prisma/enums";
import { getCronSecretHeader } from "@/utils/cron";
import { getInternalApiUrl } from "@/utils/internal-api";
import { createScopedLogger } from "@/utils/logger";
import prisma from "@/utils/prisma";

const logger = createScopedLogger("snoozed-threads");

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
  const snoozedThread = await prisma.snoozedThread.create({
    data: { emailAccountId, scheduledFor, threadId },
  });

  const client = getQstashClient();
  if (!client) {
    logger.info("QStash unavailable; snoozed thread will use cron fallback", {
      snoozedThreadId: snoozedThread.id,
      scheduledFor,
    });
    return snoozedThread;
  }

  try {
    const response = await client.publishJSON({
      url: `${getInternalApiUrl()}/api/snoozed-threads/execute`,
      body: { snoozedThreadId: snoozedThread.id },
      notBefore: getUnixTime(scheduledFor),
      deduplicationId: `snoozed-thread-${snoozedThread.id}`,
      contentBasedDeduplication: false,
      headers: getCronSecretHeader(),
    });
    const scheduledId =
      "messageId" in response ? response.messageId : undefined;

    return await prisma.snoozedThread.update({
      where: { id: snoozedThread.id },
      data: {
        scheduledId,
        schedulingStatus: "SCHEDULED",
      },
    });
  } catch (error) {
    await prisma.snoozedThread.update({
      where: { id: snoozedThread.id },
      data: {
        schedulingStatus: "FAILED",
        status: SnoozedThreadStatus.FAILED,
      },
    });
    logger.error("Failed to schedule snoozed thread", {
      error,
      snoozedThreadId: snoozedThread.id,
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
  await prisma.snoozedThread.update({
    where: { id },
    data: { status: SnoozedThreadStatus.CANCELLED },
  });

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

export async function markSnoozedThreadAsExecuting(id: string) {
  const updated = await prisma.snoozedThread.updateMany({
    where: { id, status: SnoozedThreadStatus.PENDING },
    data: { status: SnoozedThreadStatus.EXECUTING },
  });
  return updated.count === 1;
}
