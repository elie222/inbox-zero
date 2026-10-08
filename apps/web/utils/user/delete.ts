import { deleteContact as deleteLoopsContact } from "@inboxzero/loops";
import { deleteContact as deleteResendContact } from "@inboxzero/transactional-email";
import { withThreadPageBufferDeletion } from "@/utils/redis/thread-page-buffer";
import prisma from "@/utils/prisma";
import { deleteTinybirdEmailData } from "@inboxzero/tinybird";
import { after } from "next/server";
import {
  deletePosthogUser,
  trackUserDeleted,
  trackUserDeletionRequested,
} from "@/utils/posthog";
import { captureException, SafeError } from "@/utils/error";
import { stopWatchingEmailAccount } from "@/utils/email/watch-manager";
import type { Logger } from "@/utils/logger";
import { prepareMemberRemovalNotifications } from "@/utils/team-comments/member-removal";
import { deleteAccountUploadDirectory } from "@/utils/mail-api/upload-blobs";
import { clearCachedResearchForUser } from "@/utils/redis/research-cache";
import { releaseAccountBookings } from "@/utils/meeting-recorder/reconcile";
import { deleteAccountRecordingMedia } from "@/utils/meeting-recorder/delete-media";
import {
  DELETE_ACCOUNT_REQUIRES_OWNER_TRANSFER_ERROR,
  getDeletableOrganizationIdsOrThrow,
  getDeletedAccountOwnershipImpact,
  getDeleteSoloOrganizationsOperation,
  isMemberEmailAccountForeignKeyError,
  isOrganizationOwnerInvariantError,
} from "@/utils/organizations/ownership";

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
  const emailAccountIds = accounts
    .map((account) => account.emailAccount?.id)
    .filter((id): id is string => Boolean(id));
  const ownershipImpact =
    await getDeletedAccountOwnershipImpact(emailAccountIds);
  const organizationIdsToDelete = getDeletableOrganizationIdsOrThrow(
    ownershipImpact,
    DELETE_ACCOUNT_REQUIRES_OWNER_TRANSFER_ERROR,
  );

  // Drop every session before the slower resource cleanup so a second device
  // cannot keep calling the API while deletion is in progress.
  await prisma.session.deleteMany({ where: { userId } });

  logger.info("Deleting user resources");

  try {
    await trackUserDeletionRequested(userId).catch((error) => {
      logger.error("Error tracking user deletion request", { error });
      captureException(error);
    });

    clearCachedResearchForUser(userId).catch((error) => {
      logger.error("Error clearing cached research", { error });
      captureException(error);
    });

    await withThreadPageBufferDeletion(emailAccountIds, async () => {
      await deleteSoloOrganizations({
        organizationIds: organizationIdsToDelete,
        deletedEmailAccountIds: emailAccountIds,
      });

      const resourcesPromise = accounts.map(async (account) => {
        if (!account.emailAccount) return Promise.resolve();

        return deleteResources({
          emailAccountId: account.emailAccount.id,
          email: account.emailAccount.email,
          userId,
          provider: account.provider,
          hasAccessToken: Boolean(account.access_token),
          subscriptionId: account.emailAccount.watchEmailsSubscriptionId,
          logger,
        });
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

        captureException(customError, { extra: { failures } });
        throw originalError;
      }
    });

    const emails = accounts
      .map((account) => account.emailAccount?.email)
      .filter((email): email is string => Boolean(email));
    after(() =>
      deleteTinybirdEmailData(emails).catch((error) => {
        logger.error("Error deleting Tinybird data", { error });
        captureException(error);
      }),
    );
  } catch (error) {
    logger.error("Error during user resources deletion process", {
      error,
    });
    captureException(error);
    throw error;
  }
}

async function deleteSoloOrganizations({
  organizationIds,
  deletedEmailAccountIds,
}: {
  organizationIds: string[];
  deletedEmailAccountIds: string[];
}) {
  if (organizationIds.length === 0) return;

  await getDeleteSoloOrganizationsOperation(
    organizationIds,
    deletedEmailAccountIds,
  );
}

async function deleteResources({
  emailAccountId,
  email,
  userId,
  provider,
  hasAccessToken,
  subscriptionId,
  logger,
}: {
  emailAccountId: string;
  email: string;
  userId: string;
  provider: string;
  hasAccessToken: boolean;
  subscriptionId: string | null;
  logger: Logger;
}) {
  const resourcesPromise = Promise.allSettled([
    deleteLoopsContact(email),
    deletePosthogUser({ email }),
    deleteResendContact({ email }),
  ]);

  try {
    // These read the account's tokens and recordings, which cascade with the
    // user, so they must finish before the rows go.
    await stopWatchingEmailAccount({
      emailAccountId,
      provider,
      hasAccessToken,
      subscriptionId,
      logger,
    });
    await releaseAccountBookings({ emailAccountId, logger });
    await deleteAccountRecordingMedia({ emailAccountId, logger });

    // First delete ExecutedRules and their associated ExecutedActions in batches
    // If we try do this in one go for a user with a lot of executed rules, this will fail
    logger.info("Deleting ExecutedRules in batches");
    await deleteExecutedRulesInBatches({ emailAccountId, logger });

    logger.info("Deleting user");
    const notifyConversations = await prepareMemberRemovalNotifications(
      { emailAccount: { userId } },
      logger,
    );
    // Members restrict email account deletion, so they go first.
    const [, deletedUser] = await prisma.$transaction([
      prisma.member.deleteMany({ where: { emailAccount: { userId } } }),
      prisma.user.deleteMany({ where: { id: userId } }),
    ]);
    await notifyConversations();

    // PostHog tracks the completed delete after the database delete succeeds.
    if (deletedUser.count > 0) await trackUserDeleted(userId);
    await deleteAccountUploadDirectory(emailAccountId).catch((error) => {
      logger.error("Failed to delete account mail uploads", {
        error,
        emailAccountId,
      });
    });
  } catch (error) {
    if (
      isOrganizationOwnerInvariantError(error) ||
      isMemberEmailAccountForeignKeyError(error)
    ) {
      throw new SafeError(DELETE_ACCOUNT_REQUIRES_OWNER_TRANSFER_ERROR);
    }

    logger.error("Error during database user deletion process", {
      error,
    });
    captureException(error, { emailAccountId, userEmail: email });
    throw error;
  }

  return resourcesPromise;
}

/**
 * Delete ExecutedRules and their associated ExecutedActions in batches
 */
async function deleteExecutedRulesInBatches({
  emailAccountId,
  batchSize = 1000,
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
      orderBy: { id: "asc" },
      take: batchSize,
    });

    if (executedRules.length === 0) {
      logger.info("Completed deletion of ExecutedRules", {
        total: deletedTotal,
      });
      break;
    }

    const ruleIds = executedRules.map((rule) => rule.id);

    const { count: deletedScheduledActionCount } =
      await prisma.scheduledAction.deleteMany({
        where: { executedRuleId: { in: ruleIds } },
      });

    const { count: deletedExecutedActionCount } =
      await prisma.executedAction.deleteMany({
        where: { executedRuleId: { in: ruleIds } },
      });

    const { count: deletedExecutedRuleCount } =
      await prisma.executedRule.deleteMany({
        where: { id: { in: ruleIds } },
      });

    deletedTotal += deletedExecutedRuleCount;
    logger.info("Deleted batch of ExecutedRules", {
      deletedCount: deletedExecutedRuleCount,
      deletedExecutedActionCount,
      deletedScheduledActionCount,
      total: deletedTotal,
    });
  }

  return deletedTotal;
}
