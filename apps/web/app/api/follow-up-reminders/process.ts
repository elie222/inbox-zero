import { subHours } from "date-fns/subHours";
import { addMinutes } from "date-fns/addMinutes";
import { differenceInDays } from "date-fns/differenceInDays";
import prisma from "@/utils/prisma";
import { getPremiumUserFilter } from "@/utils/premium";
import { createEmailProvider } from "@/utils/email/provider";
import {
  applyFollowUpLabel,
  getOrCreateFollowUpLabel,
} from "@/utils/follow-up/labels";
import { generateFollowUpDraft } from "@/utils/follow-up/generate-draft";
import {
  getFollowUpNotificationChannels,
  sendFollowUpNotification,
  type FollowUpNotificationChannel,
} from "@/utils/follow-up/send-follow-up-notification";
import { ThreadTrackerType, SystemType } from "@/generated/prisma/enums";
import type { EmailProvider, EmailLabel } from "@/utils/email/types";
import type { Logger } from "@/utils/logger";
import { captureException } from "@/utils/error";
import {
  getProviderRateLimitDelayMs,
  withRateLimitRecording,
} from "@/utils/email/rate-limit";
import {
  isProviderRateLimitModeError,
  toRateLimitProvider,
} from "@/utils/email/rate-limit-mode-error";
import type { EmailAccountWithAI } from "@/utils/llms/types";
import {
  getLabelsFromDb,
  type LabelIds,
} from "@/utils/reply-tracker/label-helpers";
import { getRuleLabel } from "@/utils/rule/consts";
import { internalDateToDate } from "@/utils/date";
import {
  extractEmailAddress,
  extractNameFromEmail,
  isSameEmailAddress,
} from "@/utils/email";
import {
  isGoogleProvider,
  isMicrosoftProvider,
} from "@/utils/email/provider-types";
import { isDuplicateError } from "@/utils/prisma-helpers";
import { getEmailUrlForOptionalMessage } from "@/utils/url";
import { env } from "@/env";

const FOLLOW_UP_ELIGIBILITY_WINDOW_MINUTES = 15;
const FOLLOW_UP_THREAD_SCAN_LIMIT = 50;

const followUpReminderAccountSelect = {
  id: true,
  email: true,
  about: true,
  userId: true,
  multiRuleSelectionEnabled: true,
  sensitiveDataPolicy: true,
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
} as const;

type FollowUpReminderAccount = EmailAccountWithAI & {
  followUpAwaitingReplyDays: number | null;
  followUpNeedsReplyDays: number | null;
  followUpAutoDraftEnabled: boolean;
};

type FollowUpReminderAccountResult =
  | "success"
  | "error"
  | "rate-limited"
  | "not-eligible";

export async function getEligibleFollowUpReminderEmailAccountIds() {
  const emailAccounts = await prisma.emailAccount.findMany({
    where: getFollowUpReminderEligibilityWhere(),
    select: { id: true },
  });

  return emailAccounts.map((emailAccount) => emailAccount.id);
}

export async function processAllFollowUpReminders(logger: Logger) {
  logger.info("Processing follow-up reminders for all users");
  const startTime = Date.now();

  const emailAccounts = await prisma.emailAccount.findMany({
    where: getFollowUpReminderEligibilityWhere(),
    select: followUpReminderAccountSelect,
  });

  logger.info("Found eligible accounts", { count: emailAccounts.length });

  let successCount = 0;
  let errorCount = 0;
  let rateLimitedCount = 0;

  for (const emailAccount of emailAccounts) {
    const accountLogger = logger.with({
      emailAccountId: emailAccount.id,
    });
    const status = await processLoadedFollowUpReminderAccount({
      emailAccount,
      logger: accountLogger,
    });

    if (status === "success") {
      successCount++;
      continue;
    }

    if (status === "rate-limited") {
      rateLimitedCount++;
      continue;
    }

    if (status === "error") {
      errorCount++;
    }
  }

  logger.info("Completed processing follow-up reminders", {
    total: emailAccounts.length,
    success: successCount,
    errors: errorCount,
    rateLimited: rateLimitedCount,
    processingTimeMs: Date.now() - startTime,
  });

  return {
    total: emailAccounts.length,
    success: successCount,
    errors: errorCount,
    rateLimited: rateLimitedCount,
  };
}

export async function processFollowUpRemindersForEmailAccountId({
  emailAccountId,
  logger,
}: {
  emailAccountId: string;
  logger: Logger;
}): Promise<FollowUpReminderAccountResult> {
  const accountLogger = logger.with({ emailAccountId });
  const emailAccount = await prisma.emailAccount.findFirst({
    where: {
      id: emailAccountId,
      ...getFollowUpReminderEligibilityWhere(),
    },
    select: followUpReminderAccountSelect,
  });

  if (!emailAccount) {
    accountLogger.info("Skipping account that is no longer eligible");
    return "not-eligible";
  }

  return processLoadedFollowUpReminderAccount({
    emailAccount,
    logger: accountLogger,
  });
}

export async function processAccountFollowUps({
  emailAccount,
  logger,
}: {
  emailAccount: FollowUpReminderAccount;
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

  const [dbLabels, providerLabels, notificationChannels] = await Promise.all([
    getLabelsFromDb(emailAccountId),
    provider.getLabels({ includeHidden: true }),
    getFollowUpNotificationChannels(emailAccountId),
  ]);
  const followUpLabel = await getOrCreateFollowUpLabel(
    provider,
    providerLabels,
  );

  const providerName = emailAccount.account.provider;

  await processFollowUpsForType({
    systemType: SystemType.AWAITING_REPLY,
    thresholdDays: emailAccount.followUpAwaitingReplyDays,
    generateDraft:
      emailAccount.followUpAutoDraftEnabled &&
      !env.NEXT_PUBLIC_AUTO_DRAFT_DISABLED,
    emailAccount,
    provider,
    providerName,
    followUpLabelId: followUpLabel.id,
    dbLabels,
    providerLabels,
    notificationChannels,
    now,
    logger,
  });

  await processFollowUpsForType({
    systemType: SystemType.TO_REPLY,
    thresholdDays: emailAccount.followUpNeedsReplyDays,
    generateDraft: false,
    emailAccount,
    provider,
    providerName,
    followUpLabelId: followUpLabel.id,
    dbLabels,
    providerLabels,
    notificationChannels,
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

function getRetryAtFromRateLimitError(
  error: unknown,
  provider?: string | null,
): Date | undefined {
  if (isProviderRateLimitModeError(error) && error.retryAt) {
    const retryAt = new Date(error.retryAt);
    if (!Number.isNaN(retryAt.getTime())) return retryAt;
  }

  const rateLimitProvider = toRateLimitProvider(provider);
  if (!rateLimitProvider) return;

  const delayMs = getProviderRateLimitDelayMs({
    error,
    provider: rateLimitProvider,
    attemptNumber: 1,
  });
  if (!delayMs) return;
  return new Date(Date.now() + delayMs);
}

async function processFollowUpsForType({
  systemType,
  thresholdDays,
  generateDraft,
  emailAccount,
  provider,
  providerName,
  followUpLabelId,
  dbLabels,
  providerLabels,
  notificationChannels,
  now,
  logger,
}: {
  systemType: SystemType;
  thresholdDays: number | null;
  generateDraft: boolean;
  emailAccount: EmailAccountWithAI;
  provider: EmailProvider;
  providerName: string;
  followUpLabelId: string;
  dbLabels: LabelIds;
  providerLabels: EmailLabel[];
  notificationChannels: FollowUpNotificationChannel[];
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
    maxResults: FOLLOW_UP_THREAD_SCAN_LIMIT,
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
          sentAt: messageDate,
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
        if (isMessageFromUser(lastMessage, emailAccount.email)) {
          try {
            await generateFollowUpDraft({
              emailAccount,
              threadId: thread.id,
              messageId: lastMessage.id,
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
        } else {
          threadLogger.info(
            "Skipping follow-up draft because latest message was not sent by the user",
            { messageId: lastMessage.id },
          );
        }
      }

      if (notificationChannels.length > 0) {
        // Fire-and-forget: we try once per (threadId, messageId) and rely on
        // the ledger to skip next run. Retrying would burn provider rate
        // limits (Gmail re-labeling, Slack API) if a channel is misconfigured.
        try {
          const { name: counterpartyName, email: counterpartyEmail } =
            resolveFollowUpCounterparty({
              trackerType,
              fromHeader: lastMessage.headers.from,
              toHeader: lastMessage.headers.to,
            });
          await sendFollowUpNotification({
            channels: notificationChannels,
            subject: lastMessage.subject || "(no subject)",
            counterpartyName,
            counterpartyEmail,
            trackerType,
            daysSinceSent: Math.max(1, differenceInDays(now, messageDate)),
            snippet: lastMessage.snippet || undefined,
            threadLink:
              getEmailUrlForOptionalMessage({
                messageId: lastMessage.id,
                threadId: thread.id,
                emailAddress: emailAccount.email,
                provider: providerName,
              }) ?? undefined,
            threadLinkLabel: getThreadLinkLabel(providerName),
            trackerId: tracker.id,
            logger: threadLogger,
          });
        } catch (notifyError) {
          threadLogger.error(
            "Follow-up notification failed, label still applied",
            { error: notifyError },
          );
          captureException(notifyError);
        }
      }

      threadLogger.info("Processed follow-up", { draftCreated });
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

type ProcessedFollowUpLedger = Map<
  string,
  { messageIds: Set<string>; sentAtTimes: Set<number> }
>;

async function getProcessedFollowUpLedger({
  emailAccountId,
  threadIds,
}: {
  emailAccountId: string;
  threadIds: string[];
}): Promise<ProcessedFollowUpLedger> {
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
    select: { threadId: true, messageId: true, resolved: true, sentAt: true },
  });

  const processedLedger: ProcessedFollowUpLedger = new Map();

  for (const tracker of existingTrackers) {
    const processed = processedLedger.get(tracker.threadId) ?? {
      messageIds: new Set<string>(),
      sentAtTimes: new Set<number>(),
    };
    processed.messageIds.add(tracker.messageId);
    if (!tracker.resolved && tracker.sentAt) {
      processed.sentAtTimes.add(tracker.sentAt.getTime());
    }
    processedLedger.set(tracker.threadId, processed);
  }

  return processedLedger;
}

// sentAt is checked for unresolved trackers because Outlook can return a
// different provider message ID for the same sent message across runs.
function hasFollowUpBeenProcessed({
  processedLedger,
  threadId,
  messageId,
  sentAt,
}: {
  processedLedger: ProcessedFollowUpLedger;
  threadId: string;
  messageId: string;
  sentAt: Date;
}): boolean {
  const processed = processedLedger.get(threadId);
  if (!processed) return false;

  return (
    processed.messageIds.has(messageId) ||
    processed.sentAtTimes.has(sentAt.getTime())
  );
}

async function processLoadedFollowUpReminderAccount({
  emailAccount,
  logger,
}: {
  emailAccount: FollowUpReminderAccount;
  logger: Logger;
}): Promise<Exclude<FollowUpReminderAccountResult, "not-eligible">> {
  let recordedRetryAt: Date | undefined;
  const provider = emailAccount.account?.provider;

  try {
    await withRateLimitRecording(
      {
        emailAccountId: emailAccount.id,
        provider,
        logger,
        source: "follow-up-reminders",
        onRateLimitRecorded: (state) => {
          recordedRetryAt = state?.retryAt;
        },
      },
      async () =>
        processAccountFollowUps({
          emailAccount,
          logger,
        }),
    );
    return "success";
  } catch (error) {
    const retryAtFromError = getRetryAtFromRateLimitError(error, provider);
    const retryAt = recordedRetryAt || retryAtFromError;

    if (retryAt) {
      logger.warn(
        "Skipping follow-up reminders while provider rate limit is active",
        {
          retryAt: retryAt.toISOString(),
        },
      );
      return "rate-limited";
    }

    logger.error("Failed to process follow-up reminders for user", {
      error,
    });
    captureException(error);
    return "error";
  }
}

function getFollowUpReminderEligibilityWhere() {
  return {
    OR: [
      { followUpAwaitingReplyDays: { not: null } },
      { followUpNeedsReplyDays: { not: null } },
    ],
    ...getPremiumUserFilter(),
  };
}

function isMessageFromUser(
  message: { headers: { from: string } },
  userEmail: string,
) {
  return isSameEmailAddress(message.headers.from, userEmail);
}

function resolveFollowUpCounterparty({
  trackerType,
  fromHeader,
  toHeader,
}: {
  trackerType: ThreadTrackerType;
  fromHeader: string;
  toHeader: string;
}): { name: string; email: string } {
  // AWAITING: user emailed someone — return the recipient.
  // NEEDS_REPLY: someone emailed the user — return the sender.
  const header =
    trackerType === ThreadTrackerType.AWAITING ? toHeader : fromHeader;
  const email = extractEmailAddress(header || "") || header || "";
  const name = extractNameFromEmail(header || "") || email || "someone";
  return { name, email };
}

function getThreadLinkLabel(provider: string) {
  if (isGoogleProvider(provider)) return "Open in Gmail";
  if (isMicrosoftProvider(provider)) return "Open in Outlook";
  return "Open email";
}
