import { deleteContact as deleteLoopsContact } from "@inboxzero/loops";
import { deleteContact as deleteResendContact } from "@inboxzero/resend";
import prisma from "@/utils/prisma";
import { deleteTinybirdAiCalls } from "@inboxzero/tinybird-ai-analytics";
import { deletePosthogUser, trackUserDeleted } from "@/utils/posthog";
import { captureException } from "@/utils/error";
import { unwatchEmails } from "@/utils/email/watch-manager";
import { createEmailProvider } from "@/utils/email/provider";
import type { EmailProvider } from "@/utils/email/types";
import type { Logger } from "@/utils/logger";
import { sleep } from "@/utils/sleep";
import { clearCachedPerplexityResearchForUser } from "@/utils/redis/perplexity-research";

export async function deleteUser({
  userId,
  logger,
}: {
  userId: string;
  logger: Logger;
}) {
  const accounts = await prisma.account.findMany({
    where: { userId },
    select: {
      provider: true,
      access_token: true,
      refresh_token: true,
      expires_at: true,
      emailAccount: {
        select: {
          id: true,
          email: true,
          watchEmailsSubscriptionId: true,
        },
      },
    },
  });

  const resourcesPromise = accounts.map(async (account) => {
    if (!account.emailAccount) return Promise.resolve();

    // Create email provider for unwatching
    const emailProvider = account.access_token
      ? await createEmailProvider({
          emailAccountId: account.emailAccount.id,
          provider: account.provider,
        })
      : null;

    return deleteResources({
      emailAccountId: account.emailAccount.id,
      email: account.emailAccount.email,
      userId,
      emailProvider,
      subscriptionId: account.emailAccount.watchEmailsSubscriptionId,
      logger,
    });
  });

  logger.info("Deleting user resources");

  try {
    deleteTinybirdAiCalls({ userId }).catch((error) => {
      logger.error("Error deleting Tinybird AI calls", {
        error,
        userId,
      });
      captureException(error, { extra: { userId } }, userId);
    });

    clearCachedPerplexityResearchForUser(userId).catch((error) => {
      logger.error("Error clearing cached Perplexity research", { error });
      captureException(error, { extra: { userId } }, userId);
    });

    // Then proceed with the regular deletion process
    const results = await Promise.allSettled(resourcesPromise);

    logger.info("User resources deleted");

    // Log any failures
    const failures = results.filter((r) => r.status === "rejected");
    if (failures.length > 0) {
      logger.error("Some deletion operations failed", {
        failures: failures.map((f) => (f as PromiseRejectedResult).reason),
      });

      const originalError = (failures[0] as PromiseRejectedResult)?.reason;
      const customError = new Error("User deletion error");
      customError.cause = originalError;

      captureException(customError, { extra: { failures, userId } });
    }
  } catch (error) {
    logger.error("Error during user resources deletion process", {
      error,
    });
    captureException(error, { extra: { userId } }, userId);
  }
}

async function deleteResources({
  emailAccountId,
  email,
  userId,
  emailProvider,
  subscriptionId,
  logger,
}: {
  emailAccountId: string;
  email: string;
  userId: string;
  emailProvider: EmailProvider | null;
  subscriptionId: string | null;
  logger: Logger;
}) {
  const resourcesPromise = Promise.allSettled([
    deleteLoopsContact(emailAccountId),
    deletePosthogUser({ email }),
    deleteResendContact({ email }),
    emailProvider
      ? unwatchEmails({
          emailAccountId,
          provider: emailProvider,
          subscriptionId,
          logger,
        })
      : Promise.resolve(),
  ]);

  try {
    // First delete ExecutedRules and their associated ExecutedActions in batches
    // If we try do this in one go for a user with a lot of executed rules, this will fail
    logger.info("Deleting ExecutedRules in batches");
    await deleteExecutedRulesInBatches({ emailAccountId, logger });

    logger.info("Deleting user");
    await prisma.user.delete({ where: { id: userId } });

    // posthod track deleted events
    await trackUserDeleted(userId);
  } catch (error) {
    logger.error("Error during database user deletion process", {
      error,
    });
    captureException(error, { extra: { emailAccountId } }, email);
    throw error;
  }

  return resourcesPromise;
}

/**
 * Delete ExecutedRules and their associated ExecutedActions in batches
 */
async function deleteExecutedRulesInBatches({
  emailAccountId,
  batchSize = 100,
  logger,
}: {
  emailAccountId: string;
  batchSize?: number;
  logger: Logger;
}) {
  let deletedTotal = 0;

  while (true) {
    // 1. Get a batch of ExecutedRule IDs
    const executedRules = await prisma.executedRule.findMany({
      where: { emailAccountId },
      select: { id: true },
      take: batchSize,
    });

    if (executedRules.length === 0) {
      logger.info("Completed deletion of ExecutedRules", {
        total: deletedTotal,
      });
      break;
    }

    const ruleIds = executedRules.map((rule) => rule.id);

    // 2. Delete ExecutedActions for these rules
    await prisma.executedAction.deleteMany({
      where: { executedRuleId: { in: ruleIds } },
    });

    // 3. Delete the ExecutedRules
    const { count } = await prisma.executedRule.deleteMany({
      where: { id: { in: ruleIds } },
    });

    deletedTotal += count;
    logger.info("Deleted batch of ExecutedRules", {
      deletedCount: count,
      total: deletedTotal,
    });

    // Small delay to prevent database overload (optional)
    await sleep(100);
  }

  return deletedTotal;
}
