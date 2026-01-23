import { subHours } from "date-fns/subHours";
import prisma from "@/utils/prisma";
import { getPremiumUserFilter } from "@/utils/premium";
import { createEmailProvider } from "@/utils/email/provider";
import {
  applyFollowUpLabel,
  getOrCreateFollowUpLabel,
} from "@/utils/follow-up/labels";
import { generateFollowUpDraft } from "@/utils/follow-up/generate-draft";
import { ThreadTrackerType, SystemType } from "@/generated/prisma/enums";
import type { EmailProvider, EmailLabel } from "@/utils/email/types";
import type { Logger } from "@/utils/logger";
import { captureException } from "@/utils/error";
import type { EmailAccountWithAI } from "@/utils/llms/types";
import {
  getLabelsFromDb,
  type LabelIds,
} from "@/utils/reply-tracker/label-helpers";
import { getRuleLabel } from "@/utils/rule/consts";
import { internalDateToDate } from "@/utils/date";

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

  const [followUpLabel, dbLabels, providerLabels] = await Promise.all([
    getOrCreateFollowUpLabel(provider),
    getLabelsFromDb(emailAccountId),
    provider.getLabels(),
  ]);

  await processFollowUpsForType({
    systemType: SystemType.AWAITING_REPLY,
    thresholdDays: emailAccount.followUpAwaitingReplyDays,
    generateDraft: emailAccount.followUpAutoDraftEnabled,
    emailAccount,
    provider,
    followUpLabelId: followUpLabel.id,
    dbLabels,
    providerLabels,
    now,
    logger,
  });

  await processFollowUpsForType({
    systemType: SystemType.TO_REPLY,
    thresholdDays: emailAccount.followUpNeedsReplyDays,
    generateDraft: false,
    emailAccount,
    provider,
    followUpLabelId: followUpLabel.id,
    dbLabels,
    providerLabels,
    now,
    logger,
  });

  // Draft cleanup temporarily disabled to avoid deleting old drafts.
  // Wrapped in try/catch since it's non-critical
  // try {
  //   await cleanupStaleDrafts({
  //     emailAccountId,
  //     provider,
  //     logger,
  //   });
  // } catch (error) {
  //   logger.error("Failed to cleanup stale drafts", { error });
  //   captureException(error);
  // }

  logger.info("Finished processing follow-ups for account");
}

async function processFollowUpsForType({
  systemType,
  thresholdDays,
  generateDraft,
  emailAccount,
  provider,
  followUpLabelId,
  dbLabels,
  providerLabels,
  now,
  logger,
}: {
  systemType: SystemType;
  thresholdDays: number | null;
  generateDraft: boolean;
  emailAccount: EmailAccountWithAI;
  provider: EmailProvider;
  followUpLabelId: string;
  dbLabels: LabelIds;
  providerLabels: EmailLabel[];
  now: Date;
  logger: Logger;
}) {
  if (thresholdDays === null) return;

  let labelInfo = dbLabels[systemType as keyof LabelIds];
  const providerLabelIds = new Set(providerLabels.map((l) => l.id));

  if (labelInfo?.labelId && !providerLabelIds.has(labelInfo.labelId)) {
    labelInfo = { labelId: null, label: null };
  }

  if (!labelInfo?.labelId) {
    const found = providerLabels.find(
      (l) => l.name === getRuleLabel(systemType),
    );
    if (!found) {
      logger.info("Label not found, skipping", { systemType });
      return;
    }
    labelInfo = { labelId: found.id, label: found.name };
  }

  const { threads } = await provider.getThreadsWithQuery({
    query: { labelId: labelInfo.labelId },
    maxResults: 100,
  });

  logger.info("Found threads with label", {
    systemType,
    count: threads.length,
  });

  const threshold = subHours(now, thresholdDays * 24);
  const trackerType =
    systemType === SystemType.AWAITING_REPLY
      ? ThreadTrackerType.AWAITING
      : ThreadTrackerType.NEEDS_REPLY;

  let processedCount = 0;

  for (const thread of threads) {
    const threadLogger = logger.with({ threadId: thread.id });

    try {
      const lastMessage = thread.messages[thread.messages.length - 1];
      if (!lastMessage) continue;

      const messageDate = internalDateToDate(lastMessage.internalDate);
      if (messageDate >= threshold) continue;

      let tracker = await prisma.threadTracker.findFirst({
        where: {
          emailAccountId: emailAccount.id,
          threadId: thread.id,
          resolved: false,
        },
      });

      if (tracker?.followUpAppliedAt) continue;

      await applyFollowUpLabel({
        provider,
        threadId: thread.id,
        messageId: lastMessage.id,
        labelId: followUpLabelId,
        logger: threadLogger,
      });

      if (!tracker) {
        tracker = await prisma.threadTracker.create({
          data: {
            emailAccountId: emailAccount.id,
            threadId: thread.id,
            messageId: lastMessage.id,
            type: trackerType,
            sentAt: messageDate,
            followUpAppliedAt: now,
          },
        });
      } else {
        await prisma.threadTracker.update({
          where: { id: tracker.id },
          data: { followUpAppliedAt: now },
        });
      }

      if (generateDraft && tracker) {
        await generateFollowUpDraft({
          emailAccount,
          threadId: thread.id,
          trackerId: tracker.id,
          provider,
          logger: threadLogger,
        });
      }

      threadLogger.info("Processed follow-up", {
        draftGenerated: generateDraft,
      });
      processedCount++;
    } catch (error) {
      threadLogger.error("Failed to process thread", { error });
      captureException(error);
    }
  }

  logger.info("Finished processing follow-ups", {
    systemType,
    processed: processedCount,
    total: threads.length,
  });
}
