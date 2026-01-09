import { subDays } from "date-fns/subDays";
import prisma from "@/utils/prisma";
import { getPremiumUserFilter } from "@/utils/premium";
import { createEmailProvider } from "@/utils/email/provider";
import { applyFollowUpLabel } from "@/utils/follow-up/labels";
import { generateFollowUpDraft } from "@/utils/follow-up/generate-draft";
import { cleanupStaleDrafts } from "@/utils/follow-up/cleanup";
import { getLabelsFromDb } from "@/utils/reply-tracker/label-helpers";
import { ThreadTrackerType } from "@/generated/prisma/enums";
import type { EmailProvider, EmailThread } from "@/utils/email/types";
import type { Logger } from "@/utils/logger";
import { captureException } from "@/utils/error";

export async function processAllFollowUpReminders(logger: Logger) {
  logger.info("Processing follow-up reminders for all users");

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

  const provider = await createEmailProvider({
    emailAccountId,
    provider: emailAccount.account.provider,
    logger,
  });

  const dbLabels = await getLabelsFromDb(emailAccountId);
  const awaitingLabelId = dbLabels.AWAITING_REPLY.labelId;
  const toReplyLabelId = dbLabels.TO_REPLY.labelId;

  if (awaitingLabelId) {
    const awaitingThreshold = subDays(
      now,
      emailAccount.followUpAwaitingReplyDays,
    );

    const { threads: awaitingThreads } = await provider.getThreadsWithQuery({
      query: {
        labelId: awaitingLabelId,
        before: awaitingThreshold,
      },
      maxResults: 100,
    });

    logger.info("Found awaiting threads from provider", {
      count: awaitingThreads.length,
      thresholdDays: emailAccount.followUpAwaitingReplyDays,
    });

    await processThreads({
      threads: awaitingThreads,
      emailAccountId,
      provider,
      trackerType: ThreadTrackerType.AWAITING,
      generateDraft: emailAccount.followUpAutoDraftEnabled,
      now,
      logger,
    });
  } else {
    logger.info("No AWAITING_REPLY label configured, skipping");
  }

  if (toReplyLabelId) {
    const toReplyThreshold = subDays(now, emailAccount.followUpNeedsReplyDays);

    const { threads: toReplyThreads } = await provider.getThreadsWithQuery({
      query: {
        labelId: toReplyLabelId,
        before: toReplyThreshold,
      },
      maxResults: 100,
    });

    logger.info("Found to-reply threads from provider", {
      count: toReplyThreads.length,
      thresholdDays: emailAccount.followUpNeedsReplyDays,
    });

    await processThreads({
      threads: toReplyThreads,
      emailAccountId,
      provider,
      trackerType: ThreadTrackerType.NEEDS_REPLY,
      generateDraft: false,
      now,
      logger,
    });
  } else {
    logger.info("No TO_REPLY label configured, skipping");
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

  logger.info("Finished processing follow-ups for account");
}

async function processThreads({
  threads,
  emailAccountId,
  provider,
  trackerType,
  generateDraft,
  now,
  logger,
}: {
  threads: EmailThread[];
  emailAccountId: string;
  provider: EmailProvider;
  trackerType: ThreadTrackerType;
  generateDraft: boolean;
  now: Date;
  logger: Logger;
}) {
  let processedCount = 0;
  let skippedCount = 0;

  for (const thread of threads) {
    const threadLogger = logger.with({
      threadId: thread.id,
      type: trackerType,
    });

    try {
      const existingTracker = await prisma.threadTracker.findFirst({
        where: { emailAccountId, threadId: thread.id },
      });

      if (existingTracker?.followUpAppliedAt) {
        threadLogger.trace("Thread already processed, skipping");
        skippedCount++;
        continue;
      }

      const messageId = thread.messages[0]?.id;
      if (!messageId) {
        threadLogger.warn("No messages in thread, skipping");
        skippedCount++;
        continue;
      }

      await applyFollowUpLabel({
        provider,
        threadId: thread.id,
        messageId,
      });

      if (generateDraft) {
        await generateFollowUpDraft({
          emailAccountId,
          threadId: thread.id,
          provider,
          logger: threadLogger,
        });
      }

      if (existingTracker) {
        await prisma.threadTracker.update({
          where: { id: existingTracker.id },
          data: { followUpAppliedAt: now },
        });
      } else {
        await prisma.threadTracker.create({
          data: {
            emailAccountId,
            threadId: thread.id,
            messageId,
            type: trackerType,
            sentAt: thread.messages[0]?.date
              ? new Date(thread.messages[0].date)
              : now,
            followUpAppliedAt: now,
          },
        });
        threadLogger.info("Created new tracker for manually-labeled thread");
      }

      threadLogger.info("Processed thread", { draftGenerated: generateDraft });
      processedCount++;
    } catch (error) {
      threadLogger.error("Failed to process thread", { error });
      captureException(error);
    }
  }

  logger.info("Finished processing threads", {
    type: trackerType,
    processed: processedCount,
    skipped: skippedCount,
  });
}
