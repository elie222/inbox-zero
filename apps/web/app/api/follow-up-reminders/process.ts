import { subHours } from "date-fns/subHours";
import prisma from "@/utils/prisma";
import { getPremiumUserFilter } from "@/utils/premium";
import { createEmailProvider } from "@/utils/email/provider";
import {
  applyFollowUpLabel,
  getOrCreateFollowUpLabel,
} from "@/utils/follow-up/labels";
import { generateFollowUpDraft } from "@/utils/follow-up/generate-draft";
import { cleanupStaleDrafts } from "@/utils/follow-up/cleanup";
import { ThreadTrackerType } from "@/generated/prisma/enums";
import type { EmailProvider } from "@/utils/email/types";
import type { Logger } from "@/utils/logger";
import { captureException } from "@/utils/error";
import type { ThreadTracker } from "@/generated/prisma/client";
import type { EmailAccountWithAI } from "@/utils/llms/types";

export async function processAllFollowUpReminders(logger: Logger) {
  logger.info("Processing follow-up reminders for all users");

  const emailAccounts = await prisma.emailAccount.findMany({
    where: {
      OR: [
        { followUpAwaitingReplyDays: { not: null } },
        { followUpNeedsReplyDays: { not: null } },
      ],
      ...getPremiumUserFilter(),
    },
    select: {
      id: true,
      email: true,
      about: true,
      userId: true,
      multiRuleSelectionEnabled: true,
      timezone: true,
      calendarBookingLink: true,
      followUpAwaitingReplyDays: true,
      followUpNeedsReplyDays: true,
      followUpAutoDraftEnabled: true,
      user: {
        select: {
          aiProvider: true,
          aiModel: true,
          aiApiKey: true,
        },
      },
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

export async function processAccountFollowUps({
  emailAccount,
  logger,
}: {
  emailAccount: EmailAccountWithAI & {
    followUpAwaitingReplyDays: number | null;
    followUpNeedsReplyDays: number | null;
    followUpAutoDraftEnabled: boolean;
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

  const provider = await createEmailProvider({
    emailAccountId,
    provider: emailAccount.account.provider,
    logger,
  });

  const followUpLabel = await getOrCreateFollowUpLabel(provider);

  if (emailAccount.followUpAwaitingReplyDays !== null) {
    const awaitingThreshold = subHours(
      now,
      emailAccount.followUpAwaitingReplyDays * 24,
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

    await processTrackers({
      trackers: awaitingTrackers,
      emailAccount,
      provider,
      labelId: followUpLabel.id,
      trackerType: ThreadTrackerType.AWAITING,
      generateDraft: emailAccount.followUpAutoDraftEnabled,
      now,
      logger,
    });
  }

  if (emailAccount.followUpNeedsReplyDays !== null) {
    const needsReplyThreshold = subHours(
      now,
      emailAccount.followUpNeedsReplyDays * 24,
    );
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

    await processTrackers({
      trackers: needsReplyTrackers,
      emailAccount,
      provider,
      labelId: followUpLabel.id,
      trackerType: ThreadTrackerType.NEEDS_REPLY,
      generateDraft: false,
      now,
      logger,
    });
  }

  // Wrapped in try/catch since it's non-critical
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

  logger.info("Finished processing follow-ups for account");
}

async function processTrackers({
  trackers,
  emailAccount,
  provider,
  labelId,
  trackerType,
  generateDraft,
  now,
  logger,
}: {
  trackers: ThreadTracker[];
  emailAccount: EmailAccountWithAI;
  provider: EmailProvider;
  labelId: string;
  trackerType: ThreadTrackerType;
  generateDraft: boolean;
  now: Date;
  logger: Logger;
}) {
  let processedCount = 0;

  for (const tracker of trackers) {
    const trackerLogger = logger.with({
      threadId: tracker.threadId,
      type: trackerType,
    });

    try {
      await applyFollowUpLabel({
        provider,
        threadId: tracker.threadId,
        messageId: tracker.messageId,
        labelId,
        logger: trackerLogger,
      });

      if (generateDraft) {
        await generateFollowUpDraft({
          emailAccount,
          threadId: tracker.threadId,
          provider,
          logger: trackerLogger,
        });
      }

      await prisma.threadTracker.update({
        where: { id: tracker.id },
        data: { followUpAppliedAt: now },
      });

      trackerLogger.info("Processed tracker", {
        draftGenerated: generateDraft,
      });
      processedCount++;
    } catch (error) {
      trackerLogger.error("Failed to process tracker", { error });
      captureException(error);
    }
  }

  logger.info("Finished processing trackers", {
    type: trackerType,
    processed: processedCount,
    total: trackers.length,
  });
}
