import { deleteContact as deleteLoopsContact } from "@inboxzero/loops";
import { deleteContact as deleteResendContact } from "@inboxzero/resend";
import prisma from "@/utils/prisma";
import { deleteInboxZeroLabels, deleteUserLabels } from "@/utils/redis/label";
import { deleteUserStats } from "@/utils/redis/stats";
import { deleteTinybirdEmails } from "@inboxzero/tinybird";
import { deleteTinybirdAiCalls } from "@inboxzero/tinybird-ai-analytics";
import { deletePosthogUser } from "@/utils/posthog";
import { captureException } from "@/utils/error";
import { unwatchEmails } from "@/app/api/google/watch/controller";
import { createScopedLogger } from "@/utils/logger";
import { sleep } from "@/utils/sleep";

const logger = createScopedLogger("user/delete");

export async function deleteUser({
  userId,
  email,
}: {
  userId: string;
  email: string;
}) {
  const account = await prisma.account.findFirst({
    where: { userId, provider: "google" },
    select: { access_token: true },
  });

  logger.info("Deleting user resources");

  const resourcesPromise = Promise.allSettled([
    deleteUserLabels({ email }),
    deleteInboxZeroLabels({ email }),
    deleteUserStats({ email }),
    deleteTinybirdEmails({ email }),
    deleteTinybirdAiCalls({ userId }),
    deletePosthogUser({ email }),
    deleteLoopsContact(email),
    deleteResendContact({ email }),
    account
      ? unwatchEmails({
          userId: userId,
          access_token: account.access_token ?? null,
          refresh_token: null,
        })
      : Promise.resolve(),
  ]);

  try {
    // First delete ExecutedRules and their associated ExecutedActions in batches
    // If we try do this in one go for a user with a lot of executed rules, this will fail
    logger.info("Deleting ExecutedRules in batches");
    await deleteExecutedRulesInBatches(userId);
    logger.info("Deleting user");
    await prisma.user.delete({ where: { email } });
  } catch (error) {
    logger.error("Error during database user deletion process", {
      error,
      userId,
      email,
    });
    captureException(error, { extra: { userId, email } }, email);
    throw error;
  }

  try {
    // Then proceed with the regular deletion process
    const results = await resourcesPromise;

    logger.info("User resources deleted");

    // Log any failures
    const failures = results.filter((r) => r.status === "rejected");
    if (failures.length > 0) {
      logger.error("Some deletion operations failed", {
        email,
        userId,
        failures: failures.map((f) => (f as PromiseRejectedResult).reason),
      });

      const originalError = (failures[0] as PromiseRejectedResult)?.reason;
      const customError = new Error("User deletion error");
      customError.cause = originalError;

      captureException(
        customError,
        { extra: { failures, userId, email } },
        email,
      );
    }
  } catch (error) {
    logger.error("Error during user resources deletion process", {
      error,
      userId,
      email,
    });
    captureException(error, { extra: { userId, email } }, email);
  }
}

/**
 * Delete ExecutedRules and their associated ExecutedActions in batches
 */
async function deleteExecutedRulesInBatches(userId: string, batchSize = 100) {
  let deletedTotal = 0;

  while (true) {
    // 1. Get a batch of ExecutedRule IDs
    const executedRules = await prisma.executedRule.findMany({
      where: { userId },
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
