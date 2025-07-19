import { deleteContact as deleteLoopsContact } from "@inboxzero/loops";
import { deleteContact as deleteResendContact } from "@inboxzero/resend";
import prisma from "@/utils/prisma";
import { deleteInboxZeroLabels, deleteUserLabels } from "@/utils/redis/label";
import { deleteTinybirdAiCalls } from "@inboxzero/tinybird-ai-analytics";
import { deletePosthogUser, trackUserDeleted } from "@/utils/posthog";
import { captureException } from "@/utils/error";
import { unwatchEmails } from "@/app/api/watch/controller";
import {
  createEmailProvider,
  type EmailProvider,
} from "@/utils/email/provider";
import { createScopedLogger } from "@/utils/logger";
import { sleep } from "@/utils/sleep";

const logger = createScopedLogger("user/delete");

export async function deleteUser({ userId }: { userId: string }) {
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

    // Then proceed with the regular deletion process
    const results = await Promise.allSettled(resourcesPromise);

    logger.info("User resources deleted");

    // Log any failures
    const failures = results.filter((r) => r.status === "rejected");
    if (failures.length > 0) {
      logger.error("Some deletion operations failed", {
        userId,
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
      userId,
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
}: {
  emailAccountId: string;
  email: string;
  userId: string;
  emailProvider: EmailProvider | null;
  subscriptionId: string | null;
}) {
  const resourcesPromise = Promise.allSettled([
    deleteUserLabels({ emailAccountId }),
    deleteInboxZeroLabels({ emailAccountId }),
    deleteLoopsContact(emailAccountId),
    deletePosthogUser({ email }),
    deleteResendContact({ email }),
    emailProvider
      ? unwatchEmails({
          emailAccountId,
          provider: emailProvider,
          subscriptionId,
        })
      : Promise.resolve(),
  ]);

  try {
    // First delete ExecutedRules and their associated ExecutedActions in batches
    // If we try do this in one go for a user with a lot of executed rules, this will fail
    logger.info("Deleting ExecutedRules in batches");
    await deleteExecutedRulesInBatches({ emailAccountId });

    logger.info("Deleting user");
    await prisma.user.delete({ where: { id: userId } });

    // posthod track deleted events
    await trackUserDeleted(userId);
  } catch (error) {
    logger.error("Error during database user deletion process", {
      error,
      emailAccountId,
    });
    captureException(error, { extra: { emailAccountId } }, emailAccountId);
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
}: {
  emailAccountId: string;
  batchSize?: number;
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
      logger.info(
        `Completed deletion of ExecutedRules, total: ${deletedTotal}`,
      );
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
    logger.info(
      `Deleted batch of ${count} ExecutedRules, total: ${deletedTotal}`,
    );

    // Small delay to prevent database overload (optional)
    await sleep(100);
  }

  return deletedTotal;
}
