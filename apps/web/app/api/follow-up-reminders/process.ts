import { subDays } from "date-fns/subDays";
import prisma from "@/utils/prisma";
import { getPremiumUserFilter } from "@/utils/premium";
import { createEmailProvider } from "@/utils/email/provider";
import { applyFollowUpLabel } from "@/utils/follow-up/labels";
import { generateFollowUpDraft } from "@/utils/follow-up/generate-draft";
import { cleanupStaleDrafts } from "@/utils/follow-up/cleanup";
import { ThreadTrackerType } from "@/generated/prisma/enums";
import type { Logger } from "@/utils/logger";
import { captureException } from "@/utils/error";

export async function processAllFollowUpReminders(logger: Logger) {
  logger.info("Processing follow-up reminders for all users");

  // Get all email accounts with follow-up reminders enabled
  const emailAccounts = await prisma.emailAccount.findMany({
    where: {
      followUpRemindersEnabled: true,
      ...getPremiumUserFilter(),
    },
    select: {
      id: true,
      email: true,
      followUpAwaitingReplyDays: true,
      followUpNeedsReplyDays: true,
      followUpAutoDraftEnabled: true,
      account: {
        select: {
          provider: true,
        },
      },
    },
  });

  logger.info("Found eligible accounts", { count: emailAccounts.length });

  let successCount = 0;
  let errorCount = 0;

  for (const emailAccount of emailAccounts) {
    const accountLogger = logger.with({
      emailAccountId: emailAccount.id,
    });

    try {
      await processAccountFollowUps({
        emailAccount,
        logger: accountLogger,
      });
      successCount++;
    } catch (error) {
      accountLogger.error("Failed to process follow-up reminders for user", {
        error,
      });
      captureException(error);
      errorCount++;
    }
  }

  logger.info("Completed processing follow-up reminders", {
    total: emailAccounts.length,
    success: successCount,
    errors: errorCount,
  });

  return {
    total: emailAccounts.length,
    success: successCount,
    errors: errorCount,
  };
}

async function processAccountFollowUps({
  emailAccount,
  logger,
}: {
  emailAccount: {
    id: string;
    email: string;
    followUpAwaitingReplyDays: number;
    followUpNeedsReplyDays: number;
    followUpAutoDraftEnabled: boolean;
    account: {
      provider: string;
    } | null;
  };
  logger: Logger;
}) {
  const now = new Date();
  const emailAccountId = emailAccount.id;

  logger.info("Processing follow-ups for account");

  if (!emailAccount.account?.provider) {
    logger.warn("Skipping account with no provider");
    return;
  }

  // Create email provider for this account
  const provider = await createEmailProvider({
    emailAccountId,
    provider: emailAccount.account.provider,
    logger,
  });

  // Find AWAITING threads past threshold without follow-up applied
  const awaitingThreshold = subDays(
    now,
    emailAccount.followUpAwaitingReplyDays,
  );
  const awaitingTrackers = await prisma.threadTracker.findMany({
    where: {
      emailAccountId,
      type: ThreadTrackerType.AWAITING,
      resolved: false,
      followUpAppliedAt: null,
      sentAt: { lt: awaitingThreshold },
    },
  });

  logger.info("Found awaiting trackers past threshold", {
    count: awaitingTrackers.length,
    thresholdDays: emailAccount.followUpAwaitingReplyDays,
  });

  // Find NEEDS_REPLY threads past threshold without follow-up applied
  const needsReplyThreshold = subDays(now, emailAccount.followUpNeedsReplyDays);
  const needsReplyTrackers = await prisma.threadTracker.findMany({
    where: {
      emailAccountId,
      type: ThreadTrackerType.NEEDS_REPLY,
      resolved: false,
      followUpAppliedAt: null,
      sentAt: { lt: needsReplyThreshold },
    },
  });

  logger.info("Found needs-reply trackers past threshold", {
    count: needsReplyTrackers.length,
    thresholdDays: emailAccount.followUpNeedsReplyDays,
  });

  // Process AWAITING trackers - apply label AND optionally generate draft
  for (const tracker of awaitingTrackers) {
    const trackerLogger = logger.with({
      trackerId: tracker.id,
      threadId: tracker.threadId,
      type: "AWAITING",
    });

    try {
      // Apply follow-up label
      await applyFollowUpLabel({
        provider,
        threadId: tracker.threadId,
        messageId: tracker.messageId,
      });

      // Generate follow-up draft if enabled
      if (emailAccount.followUpAutoDraftEnabled) {
        await generateFollowUpDraft({
          emailAccountId,
          threadId: tracker.threadId,
          provider,
          logger: trackerLogger,
        });
      }

      // Mark as processed
      await prisma.threadTracker.update({
        where: { id: tracker.id },
        data: { followUpAppliedAt: now },
      });

      trackerLogger.info("Processed awaiting tracker", {
        draftGenerated: emailAccount.followUpAutoDraftEnabled,
      });
    } catch (error) {
      trackerLogger.error("Failed to process awaiting tracker", { error });
      captureException(error);
    }
  }

  // Process NEEDS_REPLY trackers - only apply label, no draft
  for (const tracker of needsReplyTrackers) {
    const trackerLogger = logger.with({
      trackerId: tracker.id,
      threadId: tracker.threadId,
      type: "NEEDS_REPLY",
    });

    try {
      // Apply follow-up label only
      await applyFollowUpLabel({
        provider,
        threadId: tracker.threadId,
        messageId: tracker.messageId,
      });

      // Mark as processed
      await prisma.threadTracker.update({
        where: { id: tracker.id },
        data: { followUpAppliedAt: now },
      });

      trackerLogger.info("Processed needs-reply tracker (label only)");
    } catch (error) {
      trackerLogger.error("Failed to process needs-reply tracker", { error });
      captureException(error);
    }
  }

  // Cleanup stale drafts (>7 days old) - wrapped in try/catch since it's non-critical
  try {
    await cleanupStaleDrafts({
      emailAccountId,
      provider,
      logger,
    });
  } catch (error) {
    logger.error("Failed to cleanup stale drafts", { error });
    captureException(error);
  }

  logger.info("Finished processing follow-ups for account", {
    awaitingProcessed: awaitingTrackers.length,
    needsReplyProcessed: needsReplyTrackers.length,
  });
}
