import { Client } from "@upstash/qstash";
import type { TargetOutcome } from "@inboxzero/mail-core/operations";
import { env } from "@/env";
import { SnoozedThreadStatus } from "@/generated/prisma/enums";
import { Prisma, type SnoozedThread } from "@/generated/prisma/client";
import { getCronSecretHeader } from "@/utils/cron";
import type { SnoozeFolderIds } from "@/utils/email/types";
import { SafeError } from "@/utils/error";
import { getInternalApiUrl } from "@/utils/internal-api";
import { createScopedLogger } from "@/utils/logger";
import prisma from "@/utils/prisma";
import { isDuplicateError } from "@/utils/prisma-helpers";

const logger = createScopedLogger("snoozed-threads");
export const SNOOZE_EXECUTION_LEASE_MS = 15 * 60 * 1000;
const SNOOZE_RETRY_DELAY_MS = 5 * 60 * 1000;

type SnoozeMutation = {
  clientMutationId: string;
  clientMutationPayloadHash?: string;
  emailAccountId: string;
  scheduledFor: Date;
  threadId: string;
};

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

export async function prepareSnoozedThread(input: SnoozeMutation) {
  const { clientMutationId, emailAccountId } = input;
  const existing = await getSnoozedThreadByClientMutationId({
    clientMutationId,
    emailAccountId,
  });
  if (existing) {
    assertSnoozePayload(existing, input);
    return { created: false, snoozedThread: existing };
  }

  try {
    const snoozedThread = await prisma.snoozedThread.create({
      data: {
        ...input,
        status: SnoozedThreadStatus.PREPARING,
      },
    });
    return { created: true, snoozedThread };
  } catch (error) {
    const concurrent = await getSnoozedThreadByClientMutationId({
      clientMutationId,
      emailAccountId,
    });
    if (!concurrent) throw error;
    assertSnoozePayload(concurrent, input);
    return { created: false, snoozedThread: concurrent };
  }
}

export async function activatePreparedSnoozedThread(
  input: SnoozeMutation,
  archiveClaimedAt: Date,
  targets: TargetOutcome[],
) {
  const { clientMutationId, emailAccountId, threadId } = input;
  const snoozedThread = await getSnoozedThreadByClientMutationId({
    clientMutationId,
    emailAccountId,
  });
  if (!snoozedThread) throw new Error("Prepared snooze was not found");
  assertSnoozePayload(snoozedThread, input);
  if (snoozedThread.status === SnoozedThreadStatus.CANCELLED)
    return snoozedThread;
  if (snoozedThread.status !== SnoozedThreadStatus.PREPARING) return null;
  if (snoozedThread.archiveClaimedAt?.getTime() !== archiveClaimedAt.getTime())
    return null;

  const activation = await activateWithConflictRetry({
    id: snoozedThread.id,
    clientMutationId,
    emailAccountId,
    threadId,
    archiveClaimedAt,
    targets,
  });
  if (!activation) return null;
  const { activated, replacedSnoozes } = activation;
  assertSnoozePayload(activated, input);
  if (activated.status !== SnoozedThreadStatus.PENDING) return activated;

  await publishSnoozedThread({ replacedSnoozes, snoozedThread: activated });
  return activated;
}

export async function claimSnoozePreparation(
  receipt: Pick<SnoozedThread, "id" | "archiveClaimedAt" | "updatedAt">,
  dispatch?: {
    clientMutationPayloadHash: string;
    folders?: SnoozeFolderIds;
  },
  now = new Date(),
) {
  const { id, archiveClaimedAt, updatedAt } = receipt;
  if (snoozeArchiveRetryAfterMs(archiveClaimedAt, now)) return null;
  const result = await prisma.snoozedThread.updateMany({
    where: {
      id,
      status: SnoozedThreadStatus.PREPARING,
      updatedAt,
      archiveClaimedAt,
      ...(dispatch && { scheduledFor: { gt: now } }),
    },
    data: {
      archiveClaimedAt: now,
      ...(dispatch && {
        archiveStarted: true,
        clientMutationPayloadHash: dispatch.clientMutationPayloadHash,
        ...dispatch.folders,
      }),
    },
  });
  return result.count ? now : null;
}

export async function releaseSnoozePreparation(
  id: string,
  archiveClaimedAt: Date,
) {
  await prisma.snoozedThread.updateMany({
    where: {
      id,
      archiveClaimedAt,
      status: {
        in: [SnoozedThreadStatus.PREPARING, SnoozedThreadStatus.CANCELLED],
      },
    },
    data: { archiveClaimedAt: null },
  });
}

export async function updateSnoozeArchiveWrite({
  id,
  claim,
  previousMessageId,
  messageId,
  restoreMessageIds,
}: {
  id: string;
  claim: Date;
  previousMessageId: string | null;
  messageId: string | null;
  restoreMessageIds?: string[];
}) {
  const changed = await prisma.snoozedThread.updateMany({
    where: {
      id,
      archiveClaimedAt: claim,
      pendingArchiveMessageId: previousMessageId,
      ...(messageId && { status: SnoozedThreadStatus.PREPARING }),
    },
    data: {
      pendingArchiveMessageId: messageId,
      pendingArchiveDispatchedAt: messageId ? new Date() : null,
      ...(restoreMessageIds && { restoreMessageIds }),
    },
  });
  return changed.count === 1;
}

export function snoozeArchiveRetryAfterMs(
  archiveClaimedAt: Date | null,
  now = new Date(),
) {
  return archiveClaimedAt
    ? Math.max(
        0,
        archiveClaimedAt.getTime() + SNOOZE_EXECUTION_LEASE_MS - now.getTime(),
      )
    : 0;
}

async function activateWithConflictRetry({
  id,
  clientMutationId,
  emailAccountId,
  threadId,
  archiveClaimedAt,
  targets,
}: {
  id: string;
  clientMutationId: string;
  emailAccountId: string;
  threadId: string;
  archiveClaimedAt: Date;
  targets: TargetOutcome[];
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
      const [replacedSnoozes, , activated] = await prisma.$transaction([
        prisma.snoozedThread.findMany({
          where: replaceablePendingSnooze,
          select: { id: true },
        }),
        prisma.snoozedThread.updateMany({
          where: replaceablePendingSnooze,
          data: { status: SnoozedThreadStatus.CANCELLED },
        }),
        prisma.snoozedThread.update({
          where: {
            id,
            status: SnoozedThreadStatus.PREPARING,
            archiveClaimedAt,
            pendingArchiveMessageId: null,
            pendingRollbackMessageIds: { isEmpty: true },
          },
          data: {
            status: SnoozedThreadStatus.PENDING,
            archiveClaimedAt: null,
            restoreMessageIds: [],
            targetOutcomes: targets,
          },
        }),
      ]);
      return { activated, replacedSnoozes };
    } catch (error) {
      // A failed fenced update rolls back replacement of the active snooze too.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2025"
      )
        return null;
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

export async function getPendingSnoozeRollbackMessageIds(
  emailAccountId: string,
  excludeMutationId?: string,
) {
  const receipts = await prisma.snoozedThread.findMany({
    where: {
      emailAccountId,
      status: {
        in: [SnoozedThreadStatus.PREPARING, SnoozedThreadStatus.CANCELLED],
      },
      pendingRollbackMessageIds: { isEmpty: false },
      rollbackDispatchedAt: {
        gt: new Date(Date.now() - SNOOZE_EXECUTION_LEASE_MS),
      },
      ...(excludeMutationId && {
        OR: [
          { clientMutationId: null },
          { clientMutationId: { not: excludeMutationId } },
        ],
      }),
    },
    select: { pendingRollbackMessageIds: true },
  });
  return new Set(
    receipts.flatMap(
      ({ pendingRollbackMessageIds }) => pendingRollbackMessageIds,
    ),
  );
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

export async function cancelSnoozedThreads({
  emailAccountId,
  threadIds,
}: {
  emailAccountId: string;
  threadIds: string[];
}) {
  if (threadIds.length === 0) return [];

  const rows = await prisma.snoozedThread.findMany({
    where: {
      emailAccountId,
      threadId: { in: threadIds },
      status: {
        in: [
          SnoozedThreadStatus.PREPARING,
          SnoozedThreadStatus.PENDING,
          SnoozedThreadStatus.EXECUTING,
        ],
      },
    },
    select: { id: true, threadId: true },
  });
  if (rows.length === 0) return [];

  await prisma.snoozedThread.updateMany({
    where: { id: { in: rows.map((row) => row.id) } },
    data: { status: SnoozedThreadStatus.CANCELLED },
  });
  const client = getQstashClient();
  if (client)
    await cancelQstashMessages(
      client,
      rows.map((row) => row.id),
    );
  return [...new Set(rows.map((row) => row.threadId))];
}

export async function cancelSnoozedThreadByClientMutationId({
  clientMutationId,
  emailAccountId,
  restoredMessageIds,
  archiveClaimedAt,
}: {
  clientMutationId: string;
  emailAccountId: string;
  restoredMessageIds?: string[];
  archiveClaimedAt?: Date;
}) {
  await prisma.snoozedThread.updateMany({
    where: {
      clientMutationId,
      emailAccountId,
      status: SnoozedThreadStatus.PREPARING,
      ...(archiveClaimedAt && { archiveClaimedAt }),
      ...(restoredMessageIds && {
        restoreMessageIds: { equals: restoredMessageIds },
      }),
    },
    data: {
      status: SnoozedThreadStatus.CANCELLED,
      ...(restoredMessageIds && {
        restoreMessageIds: [],
        pendingRollbackMessageIds: [],
        rollbackDispatchedAt: null,
        rollbackArchiveObservedIds: [],
      }),
    },
  });
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
  snoozedThread: SnoozedThread,
  expected: SnoozeMutation,
) {
  // Restore retries can move scheduledFor after the original payload is stored.
  const payloadMatches = snoozedThread.clientMutationPayloadHash
    ? snoozedThread.clientMutationPayloadHash ===
      expected.clientMutationPayloadHash
    : snoozedThread.scheduledFor.getTime() === expected.scheduledFor.getTime();
  if (snoozedThread.threadId !== expected.threadId || !payloadMatches) {
    throw new SafeError(
      "Snooze mutation ID was reused with different input",
      409,
    );
  }
}

function isSnoozeActivationConflict(error: unknown) {
  return (
    isDuplicateError(error) ||
    (error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2034")
  );
}
