/**
 * Redis-backed webhook coordination for Gmail accounts.
 *
 * Ensures only one worker processes webhooks per account at a time
 * using a Redis lease + pending-history-ID coalescing pattern.
 *
 * Queue-backed execution (optional future optimization):
 *   The Redis coordination layer handles correctness (single-flight,
 *   coalescing). For deployments with queue infrastructure (Vercel Queue
 *   or QStash via utils/queue/dispatch.ts), the drain loop could be
 *   dispatched as a queue job instead of running in after(). The Redis
 *   lease and coalescing should be kept even with queues so behavior is
 *   consistent across all hosting modes.
 */
import { processHistoryForUser } from "@/app/api/google/webhook/process-history";
import { handleWebhookError } from "@/utils/webhook/error-handler";
import {
  acquireWebhookAccountLease,
  getPendingWebhookHistoryId,
  releaseWebhookAccountLease,
  setPendingWebhookHistoryId,
} from "@/utils/redis/webhook-coordination";
import type { Logger } from "@/utils/logger";
import prisma from "@/utils/prisma";

export async function coordinateWebhook({
  email,
  historyId,
  logger,
}: {
  email: string;
  historyId: number;
  logger: Logger;
}): Promise<
  | { status: "no-account" }
  | { status: "coordination-failed" }
  | { status: "lease-contention" }
  | { status: "processed" }
> {
  const emailAccountId = await getEmailAccountIdByEmail(email);
  if (!emailAccountId) return { status: "no-account" };

  try {
    await setPendingWebhookHistoryId(emailAccountId, historyId);
  } catch {
    return { status: "coordination-failed" };
  }

  let leaseToken: string | null = null;
  try {
    leaseToken = await acquireWebhookAccountLease(emailAccountId);
  } catch {
    return { status: "coordination-failed" };
  }

  if (!leaseToken) return { status: "lease-contention" };

  try {
    await drainWebhookHistory({
      emailAccountId,
      email,
      initialHistoryId: historyId,
      logger,
    });
  } finally {
    // Small race window: a webhook arriving between the last pending check
    // and this release will see lease contention and return. That pending ID
    // will be picked up by the next inbound webhook (bounded by PubSub retry).
    try {
      await releaseWebhookAccountLease(emailAccountId, leaseToken);
    } catch {
      // Lease will expire via TTL
    }
  }

  return { status: "processed" };
}

export async function drainWebhookHistory({
  emailAccountId,
  email,
  initialHistoryId,
  logger,
}: {
  emailAccountId: string;
  email: string;
  initialHistoryId: number;
  logger: Logger;
}) {
  const MAX_DRAIN_ITERATIONS = 20;
  let targetHistoryId = initialHistoryId;
  let iterationCount = 0;

  while (true) {
    iterationCount++;
    logger.info("gmail-webhook drain iteration started", {
      iterationCount,
      targetHistoryId,
    });

    try {
      await processHistoryForUser(
        { emailAddress: email, historyId: targetHistoryId },
        {},
        logger,
      );
    } catch (error) {
      await handleWebhookError(error, {
        email,
        emailAccountId,
        url: "/api/google/webhook",
        logger,
      });
      break;
    }

    logger.info("gmail-webhook drain iteration completed", {
      iterationCount,
      targetHistoryId,
    });

    if (iterationCount >= MAX_DRAIN_ITERATIONS) {
      logger.warn("gmail-webhook drain loop hit iteration cap", {
        iterationCount,
        lastHistoryId: targetHistoryId,
      });
      break;
    }

    try {
      const pendingHistoryId = await getPendingWebhookHistoryId(emailAccountId);

      if (pendingHistoryId && pendingHistoryId > targetHistoryId) {
        logger.info("gmail-webhook pending history updated", {
          previousTarget: targetHistoryId,
          pendingHistoryId,
        });
        targetHistoryId = pendingHistoryId;
        continue;
      }
    } catch (error) {
      logger.warn("gmail-webhook failed to read pending history", {
        error: error instanceof Error ? error.message : error,
      });
    }

    logger.info("gmail-webhook caught up", {
      iterationCount,
      lastHistoryId: targetHistoryId,
    });
    break;
  }
}

async function getEmailAccountIdByEmail(email: string): Promise<string | null> {
  const account = await prisma.emailAccount.findUnique({
    where: { email },
    select: { id: true },
  });
  return account?.id ?? null;
}
