import { Client } from "@upstash/qstash";
import { env } from "@/env";
import { SnoozedThreadStatus } from "@/generated/prisma/enums";
import { Prisma, type SnoozedThread } from "@/generated/prisma/client";
import { getCronSecretHeader } from "@/utils/cron";
import { getInternalApiUrl } from "@/utils/internal-api";
import { createScopedLogger } from "@/utils/logger";
import prisma from "@/utils/prisma";
import { isDuplicateError } from "@/utils/prisma-helpers";

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

  await publishSnoozedThread({ replacedSnoozes, snoozedThread });
  return snoozedThread;
}

export async function prepareSnoozedThread({
  clientMutationId,
  emailAccountId,
  scheduledFor,
  threadId,
}: {
  clientMutationId: string;
  emailAccountId: string;
  scheduledFor: Date;
  threadId: string;
}) {
  const existing = await getSnoozedThreadByClientMutationId({
    clientMutationId,
    emailAccountId,
  });
  if (existing) {
    assertSnoozePayload(existing, { scheduledFor, threadId });
    return { created: false, snoozedThread: existing };
  }

  try {
    const snoozedThread = await prisma.snoozedThread.create({
      data: {
        clientMutationId,
        emailAccountId,
        scheduledFor,
        status: SnoozedThreadStatus.PREPARING,
        threadId,
      },
    });
    return { created: true, snoozedThread };
  } catch (error) {
    const concurrent = await getSnoozedThreadByClientMutationId({
      clientMutationId,
      emailAccountId,
    });
    if (!concurrent) throw error;
    assertSnoozePayload(concurrent, { scheduledFor, threadId });
    return { created: false, snoozedThread: concurrent };
  }
}

export async function activatePreparedSnoozedThread({
  clientMutationId,
  emailAccountId,
  scheduledFor,
  threadId,
}: {
  clientMutationId: string;
  emailAccountId: string;
  scheduledFor: Date;
  threadId: string;
}) {
  const snoozedThread = await getSnoozedThreadByClientMutationId({
    clientMutationId,
    emailAccountId,
  });
  if (!snoozedThread) throw new Error("Prepared snooze was not found");
  assertSnoozePayload(snoozedThread, { scheduledFor, threadId });
  if (snoozedThread.status !== SnoozedThreadStatus.PREPARING) {
    return snoozedThread;
  }

  const { activated, replacedSnoozes } = await activateWithConflictRetry({
    clientMutationId,
    emailAccountId,
    threadId,
  });
  assertSnoozePayload(activated, { scheduledFor, threadId });
  if (activated.status !== SnoozedThreadStatus.PENDING) return activated;

  await publishSnoozedThread({ replacedSnoozes, snoozedThread: activated });
  return activated;
}

async function activateWithConflictRetry({
  clientMutationId,
  emailAccountId,
  threadId,
}: {
  clientMutationId: string;
  emailAccountId: string;
  threadId: string;
}) {
  const pendingSnooze = {
    emailAccountId,
    threadId,
    status: SnoozedThreadStatus.PENDING,
  };
  const replaceablePendingSnooze = {
    ...pendingSnooze,
    OR: [
      { clientMutationId: null },
      { clientMutationId: { not: clientMutationId } },
    ],
  };
  for (let attempt = 0; ; attempt += 1) {
    try {
      const [replacedSnoozes, , , activated] = await prisma.$transaction([
        prisma.snoozedThread.findMany({
          where: replaceablePendingSnooze,
          select: { id: true },
        }),
        prisma.snoozedThread.updateMany({
          where: replaceablePendingSnooze,
          data: { status: SnoozedThreadStatus.CANCELLED },
        }),
        prisma.snoozedThread.updateMany({
          where: {
            emailAccountId,
            clientMutationId,
            status: SnoozedThreadStatus.PREPARING,
          },
          data: { status: SnoozedThreadStatus.PENDING },
        }),
        prisma.snoozedThread.findUniqueOrThrow({
          where: {
            emailAccountId_clientMutationId: {
              emailAccountId,
              clientMutationId,
            },
          },
        }),
      ]);
      return { activated, replacedSnoozes };
    } catch (error) {
      if (attempt >= 2 || !isSnoozeActivationConflict(error)) throw error;
    }
  }
}

async function publishSnoozedThread({
  replacedSnoozes,
  snoozedThread,
}: {
  replacedSnoozes: { id: string }[];
  snoozedThread: SnoozedThread;
}) {
  const { scheduledFor } = snoozedThread;

  const client = getQstashClient();
  if (!client) {
    logger.info("QStash unavailable; snoozed thread will use cron fallback", {
      snoozedThreadId: snoozedThread.id,
      scheduledFor,
    });
    return;
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
}

export function getSnoozedThreadByClientMutationId({
  clientMutationId,
  emailAccountId,
}: {
  clientMutationId: string;
  emailAccountId: string;
}) {
  return prisma.snoozedThread.findUnique({
    where: {
      emailAccountId_clientMutationId: { emailAccountId, clientMutationId },
    },
  });
}

export async function cancelSnoozedThreadByClientMutationId({
  clientMutationId,
  emailAccountId,
}: {
  clientMutationId: string;
  emailAccountId: string;
}) {
  const snoozedThread = await prisma.snoozedThread.findUnique({
    where: {
      emailAccountId_clientMutationId: { emailAccountId, clientMutationId },
    },
    select: { id: true },
  });
  if (!snoozedThread) return;
  await prisma.snoozedThread.updateMany({
    where: {
      id: snoozedThread.id,
      status: {
        in: [
          SnoozedThreadStatus.PREPARING,
          SnoozedThreadStatus.PENDING,
          SnoozedThreadStatus.EXECUTING,
        ],
      },
    },
    data: { status: SnoozedThreadStatus.CANCELLED },
  });
  const client = getQstashClient();
  if (client) await cancelQstashMessages(client, [snoozedThread.id]);
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

function assertSnoozePayload(
  snoozedThread: Pick<SnoozedThread, "scheduledFor" | "threadId">,
  expected: { scheduledFor: Date; threadId: string },
) {
  if (
    snoozedThread.threadId !== expected.threadId ||
    snoozedThread.scheduledFor.getTime() !== expected.scheduledFor.getTime()
  ) {
    throw new Error("Snooze mutation ID was reused with different input");
  }
}

function isSnoozeActivationConflict(error: unknown) {
  return (
    isDuplicateError(error) ||
    (error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2034")
  );
}
