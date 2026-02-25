import { subHours } from "date-fns/subHours";
import { addMinutes } from "date-fns/addMinutes";
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
import {
  isGmailRateLimitModeError,
  withRateLimitRecording,
} from "@/utils/gmail/rate-limit";
import type { EmailAccountWithAI } from "@/utils/llms/types";
import {
  getLabelsFromDb,
  type LabelIds,
} from "@/utils/reply-tracker/label-helpers";
import { getRuleLabel } from "@/utils/rule/consts";
import { internalDateToDate } from "@/utils/date";
import { isDuplicateError } from "@/utils/prisma-helpers";

const FOLLOW_UP_ELIGIBILITY_WINDOW_MINUTES = 15;

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
  let rateLimitedCount = 0;

  for (const emailAccount of emailAccounts) {
    const accountLogger = logger.with({
      emailAccountId: emailAccount.id,
    });
    let recordedRetryAt: Date | undefined;

    try {
      await withRateLimitRecording(
        {
          emailAccountId: emailAccount.id,
          provider:
            emailAccount.account.provider === "microsoft"
              ? "microsoft"
              : "google",
          logger: accountLogger,
          source: "follow-up-reminders",
          onRateLimitRecorded: (state) => {
            recordedRetryAt = state?.retryAt;
          },
        },
        async () =>
          processAccountFollowUps({
            emailAccount,
            logger: accountLogger,
          }),
      );
      successCount++;
    } catch (error) {
      const retryAtFromError =
        isGmailRateLimitModeError(error) && error.retryAt
          ? new Date(error.retryAt)
          : undefined;
      const retryAt = recordedRetryAt || retryAtFromError;

      if (retryAt) {
        accountLogger.warn(
          "Skipping follow-up reminders while provider rate limit is active",
          {
            retryAt: retryAt.toISOString(),
          },
        );
        rateLimitedCount++;
        continue;
      }

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
    rateLimited: rateLimitedCount,
  });

  return {
    total: emailAccounts.length,
    success: successCount,
    errors: errorCount,
    rateLimited: rateLimitedCount,
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

  const [dbLabels, providerLabels] = await Promise.all([
    getLabelsFromDb(emailAccountId),
    provider.getLabels(),
  ]);
  const followUpLabel = await getOrCreateFollowUpLabel(
    provider,
    providerLabels,
  );

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

  const dbLabelInfo = dbLabels[systemType as keyof LabelIds];
  const providerLabelIds = new Set(providerLabels.map((l) => l.id));

  let labelId: string;

  if (dbLabelInfo?.labelId && providerLabelIds.has(dbLabelInfo.labelId)) {
    labelId = dbLabelInfo.labelId;
  } else {
    const found = providerLabels.find(
      (l) => l.name === getRuleLabel(systemType),
    );
    if (!found) {
      logger.info("Label not found, skipping", { systemType });
      return;
    }
    labelId = found.id;
  }

  const threads = await provider.getThreadsWithLabel({
    labelId,
    maxResults: 100,
  });

  logger.info("Found threads with label", {
    systemType,
    count: threads.length,
  });

  const threshold = subHours(now, thresholdDays * 24);
  const thresholdWithWindow = getThresholdWithWindow(
    threshold,
    FOLLOW_UP_ELIGIBILITY_WINDOW_MINUTES,
  );
  const trackerType =
    systemType === SystemType.AWAITING_REPLY
      ? ThreadTrackerType.AWAITING
      : ThreadTrackerType.NEEDS_REPLY;

  const threadIds = threads.map((t) => t.id);
  const processedLedger = await getProcessedFollowUpLedger({
    emailAccountId: emailAccount.id,
    threadIds,
  });

  let processedCount = 0;
  let skippedAlreadyProcessedCount = 0;
  let skippedNoLatestMessageCount = 0;
  let skippedTooRecentCount = 0;
  let errorCount = 0;
  const skippedAlreadyProcessedThreadIds = new Set<string>();

  for (const thread of threads) {
    const threadLogger = logger.with({ threadId: thread.id });

    try {
      const lastMessage = await provider.getLatestMessageFromThreadSnapshot({
        id: thread.id,
        messages: thread.messages,
      });
      if (!lastMessage) {
        skippedNoLatestMessageCount++;
        continue;
      }

      const messageDate = internalDateToDate(lastMessage.internalDate);
      if (messageDate >= thresholdWithWindow) {
        skippedTooRecentCount++;
        continue;
      }

      if (
        hasFollowUpBeenProcessed({
          processedLedger,
          threadId: thread.id,
          messageId: lastMessage.id,
        })
      ) {
        skippedAlreadyProcessedCount++;
        skippedAlreadyProcessedThreadIds.add(thread.id);
        continue;
      }

      await applyFollowUpLabel({
        provider,
        threadId: thread.id,
        messageId: lastMessage.id,
        labelId: followUpLabelId,
        logger: threadLogger,
      });

      const existingTracker = await prisma.threadTracker.findFirst({
        where: {
          emailAccountId: emailAccount.id,
          threadId: thread.id,
          type: trackerType,
          resolved: false,
        },
        orderBy: { createdAt: "desc" },
      });

      let tracker: { id: string };
      if (existingTracker) {
        try {
          tracker = await prisma.threadTracker.update({
            where: { id: existingTracker.id },
            data: {
              messageId: lastMessage.id,
              sentAt: messageDate,
              followUpAppliedAt: now,
            },
          });
        } catch (error) {
          if (isDuplicateError(error)) {
            tracker = await prisma.threadTracker.update({
              where: {
                emailAccountId_threadId_messageId: {
                  emailAccountId: emailAccount.id,
                  threadId: thread.id,
                  messageId: lastMessage.id,
                },
              },
              data: {
                resolved: false,
                type: trackerType,
                sentAt: messageDate,
                followUpAppliedAt: now,
              },
            });
          } else {
            throw error;
          }
        }
      } else {
        try {
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
        } catch (error) {
          if (isDuplicateError(error)) {
            tracker = await prisma.threadTracker.update({
              where: {
                emailAccountId_threadId_messageId: {
                  emailAccountId: emailAccount.id,
                  threadId: thread.id,
                  messageId: lastMessage.id,
                },
              },
              data: {
                resolved: false,
                type: trackerType,
                sentAt: messageDate,
                followUpAppliedAt: now,
              },
            });
          } else {
            throw error;
          }
        }
      }

      let draftCreated = false;
      if (generateDraft) {
        try {
          await generateFollowUpDraft({
            emailAccount,
            threadId: thread.id,
            trackerId: tracker.id,
            provider,
            logger: threadLogger,
          });
          draftCreated = true;
        } catch (draftError) {
          threadLogger.error("Draft generation failed, label still applied", {
            error: draftError,
          });
          captureException(draftError);
        }
      }

      threadLogger.info("Processed follow-up", {
        draftCreated,
      });
      processedCount++;
    } catch (error) {
      errorCount++;
      threadLogger.error("Failed to process thread", { error });
      captureException(error);
    }
  }

  const skippedCount =
    skippedAlreadyProcessedCount +
    skippedNoLatestMessageCount +
    skippedTooRecentCount;

  if (skippedAlreadyProcessedThreadIds.size > 0) {
    logger.info("Skipping already-processed threads", {
      systemType,
      skipped: skippedAlreadyProcessedThreadIds.size,
    });
    logger.trace("Skipped thread IDs for already-processed threads", {
      systemType,
      skippedThreadIds: [...skippedAlreadyProcessedThreadIds],
    });
  }

  logger.info("Finished processing follow-ups", {
    systemType,
    processed: processedCount,
    skipped: skippedCount,
    total: threads.length,
    skippedAlreadyProcessed: skippedAlreadyProcessedCount,
    skippedNoLatestMessage: skippedNoLatestMessageCount,
    skippedTooRecent: skippedTooRecentCount,
    errors: errorCount,
    eligibilityWindowMinutes: FOLLOW_UP_ELIGIBILITY_WINDOW_MINUTES,
    thresholdDays,
  });
}

function getThresholdWithWindow(threshold: Date, windowMinutes: number): Date {
  return addMinutes(threshold, windowMinutes);
}

async function getProcessedFollowUpLedger({
  emailAccountId,
  threadIds,
}: {
  emailAccountId: string;
  threadIds: string[];
}): Promise<Map<string, Set<string>>> {
  if (threadIds.length === 0) return new Map();

  const existingTrackers = await prisma.threadTracker.findMany({
    where: {
      emailAccountId,
      threadId: { in: threadIds },
      OR: [
        { followUpAppliedAt: { not: null } },
        { followUpDraftId: { not: null } },
      ],
    },
    select: { threadId: true, messageId: true },
  });

  const processedLedger = new Map<string, Set<string>>();

  for (const tracker of existingTrackers) {
    const messageIds =
      processedLedger.get(tracker.threadId) ?? new Set<string>();
    messageIds.add(tracker.messageId);
    processedLedger.set(tracker.threadId, messageIds);
  }

  return processedLedger;
}

function hasFollowUpBeenProcessed({
  processedLedger,
  threadId,
  messageId,
}: {
  processedLedger: Map<string, Set<string>>;
  threadId: string;
  messageId: string;
}): boolean {
  return processedLedger.get(threadId)?.has(messageId) ?? false;
}
