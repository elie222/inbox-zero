import { after } from "next/server";
import type { Prisma } from "@/generated/prisma/client";
import { ActionType, DraftEmailStatus } from "@/generated/prisma/enums";
import type { ParsedMessage } from "@/utils/types";
import prisma from "@/utils/prisma";
import { withPrismaRetry } from "@/utils/prisma-retry";
import { calculateSimilarity } from "@/utils/similarity-score";
import { isDraftUnmodified } from "@/utils/ai/choose-rule/draft-management";
import type { EmailProvider } from "@/utils/email/types";
import type { Logger } from "@/utils/logger";
import {
  isMeaningfulDraftEdit,
  saveDraftSendLogReplyMemory,
  syncReplyMemoriesFromDraftSendLogs,
} from "@/utils/ai/reply/reply-memory";
import { stripProviderSignatureFromParsedMessage } from "@/utils/email/signature-normalization";
import { replaceMessagingDraftNotificationsWithHandledOnWebState } from "@/utils/messaging/rule-notifications";
import { emailToContentForAI } from "@/utils/ai/content-sanitizer";
import { FIRST_TIME_EVENTS, trackFirstTimeEvent } from "@/utils/posthog";
import { messageRepliesToSourceSender } from "@/utils/email";
import {
  hasReferralSignature,
  stripReferralSignature,
} from "@/utils/referral/signature";
import { logReplyTrackerError } from "./error-logging";

const DRAFT_SENT_SIMILARITY_THRESHOLD = 0.7;
const BODY_SIMILARITY_STATUS = {
  SCORED: "scored",
  EMPTY_SENT_TEXT: "empty_sent_text",
  MISSING_DRAFT_TEXT: "missing_draft_text",
  MISSING_SENT_BODY: "missing_sent_body",
  SNIPPET_ONLY_SENT_BODY: "snippet_only_sent_body",
} as const;

type BodySimilarityStatus =
  (typeof BODY_SIMILARITY_STATUS)[keyof typeof BODY_SIMILARITY_STATUS];
/**
 * Checks if a sent message originated from an AI draft and logs its similarity.
 */
export async function trackSentDraftStatus({
  emailAccountId,
  message,
  provider,
  logger,
}: {
  emailAccountId: string;
  message: ParsedMessage;
  provider: EmailProvider;
  logger: Logger;
}) {
  const { threadId, id: sentMessageId } = message;

  logger.info("Checking if sent message corresponds to an AI draft");

  if (!sentMessageId) {
    logger.warn("Sent message missing ID, cannot track draft status");
    return;
  }

  // Find the most recently created draft for this thread
  const executedAction = await prisma.executedAction.findFirst({
    where: {
      executedRule: {
        emailAccountId,
        threadId: threadId,
      },
      type: ActionType.DRAFT_EMAIL,
      draftId: { not: null },
      draftSendLog: null,
    },
    orderBy: {
      createdAt: "desc",
    },
    select: {
      id: true,
      content: true,
      draftId: true,
      executedRuleId: true,
      executedRule: {
        select: {
          messageId: true,
          emailAccount: {
            select: {
              signature: true,
            },
          },
        },
      },
    },
  });

  if (!executedAction?.draftId) {
    logger.info("No corresponding AI draft action with draftId found");
    return;
  }

  const [draftExists, sourceMessage] = await Promise.all([
    provider.getDraft(executedAction.draftId),
    provider
      .getMessage(executedAction.executedRule.messageId)
      .catch((error) => {
        logger.warn("Failed to load source message for sent draft tracking", {
          error,
          executedActionId: executedAction.id,
        });
        return null;
      }),
  ]);

  const executedActionId = executedAction.id;

  // Calculate similarity between sent message and AI draft content
  // Pass full message to properly handle Outlook HTML content
  const accountSignature = executedAction.executedRule.emailAccount?.signature;
  const similarityScore = calculateSimilarity(executedAction.content, message, {
    excludedSignatures: accountSignature ? [accountSignature] : [],
  });
  const sentMessageRepliesToSource =
    sourceMessage &&
    messageRepliesToSourceSender({
      sentMessage: message,
      sourceMessage,
    });
  const sentText = getSentReplyText(message);
  const bodySimilarity = getBodySimilarityResult({
    draftText: executedAction.content,
    sentMessage: message,
    sentText,
    accountSignature,
  });
  const createDraftSendLogData = (draftStatus: DraftEmailStatus) => ({
    executedActionId: executedActionId,
    sentMessageId: sentMessageId,
    similarityScore: similarityScore,
    bodySimilarityScore: bodySimilarity.score,
    bodySimilarityStatus: bodySimilarity.status,
    sentText,
    similarityMetadata: getDraftSendLogSimilarityMetadata({
      draftText: executedAction.content,
      sentMessage: message,
      sentText,
      similarityScore,
      bodySimilarity,
      draftExists: !!draftExists,
      sentMessageRepliesToSource,
      draftStatus,
      accountSignature,
    }),
  });

  logger.info("Calculated similarity score", {
    executedActionId,
    similarityScore,
    draftExists: !!draftExists,
    sentMessageRepliesToSource,
  });

  if (draftExists || sentMessageRepliesToSource === false) {
    logger.info("Marking AI draft as not sent", {
      executedActionId: executedAction.id,
      draftId: executedAction.draftId,
      similarityScore,
      draftExists: !!draftExists,
      sentMessageRepliesToSource,
    });

    // Create DraftSendLog to record the comparison.
    const [draftSendLog] = await withPrismaRetry(
      () =>
        prisma.$transaction([
          prisma.draftSendLog.create({
            data: createDraftSendLogData(
              DraftEmailStatus.REPLIED_WITHOUT_DRAFT,
            ),
          }),
          prisma.executedAction.update({
            where: { id: executedActionId },
            data: {
              draftStatus: DraftEmailStatus.REPLIED_WITHOUT_DRAFT,
            },
          }),
        ]),
      { logger },
    );

    logger.info("Created draft send log and marked action as not sent", {
      executedActionId,
      sentMessageRepliesToSource,
    });
    await replaceMessagingDraftNotificationsWithHandledOnWebState({
      executedRuleId: executedAction.executedRuleId,
      logger,
    });
    if (sentMessageRepliesToSource !== false) {
      queueReplyMemoryLearning({
        emailAccountId,
        executedActionId,
        draftSendLogId: draftSendLog.id,
        draftText: executedAction.content,
        sentText,
        similarityScore,
        provider,
        logger,
      });
    }
    return;
  }

  logger.info(
    "Original AI draft not found (likely sent or deleted), creating send log.",
    {
      executedActionId,
      draftId: executedAction.draftId,
      similarityScore,
    },
  );

  // Gmail and Outlook both make "missing draft" ambiguous: it can mean sent,
  // deleted, moved, or no longer reachable under the stored draft ID. When the
  // sent message targets the original sender, record the lifecycle as likely
  // sent and leave edit strength to similarityScore.
  const draftStatus = getSentDraftStatus({
    similarityScore,
    sentMessageRepliesToSource,
  });
  const wasLikelyDraftSent = isDraftSentStatus(draftStatus);

  const [draftSendLog] = await withPrismaRetry(
    () =>
      prisma.$transaction([
        prisma.draftSendLog.create({
          data: createDraftSendLogData(draftStatus),
        }),
        prisma.executedAction.update({
          where: { id: executedActionId },
          data: {
            draftStatus,
          },
        }),
      ]),
    { logger },
  );

  logger.info(
    "Successfully created draft send log and updated action status via transaction",
    { executedActionId },
  );

  if (wasLikelyDraftSent) {
    after(() =>
      trackFirstTimeEvent({
        emailAccountId,
        event: FIRST_TIME_EVENTS.FIRST_DRAFT_SENT,
      }),
    );
  }

  await replaceMessagingDraftNotificationsWithHandledOnWebState({
    executedRuleId: executedAction.executedRuleId,
    logger,
  });

  queueReplyMemoryLearning({
    emailAccountId,
    executedActionId,
    draftSendLogId: draftSendLog.id,
    draftText: executedAction.content,
    sentText,
    similarityScore,
    provider,
    logger,
  });
}

/**
 * Cleans up old AI-generated drafts in a thread.
 * Handles both rule-based drafts (ExecutedAction) and follow-up drafts (ThreadTracker).
 * For rule drafts: checks if unmodified before deleting.
 * For follow-up drafts: deletes unconditionally (stale if new message arrived).
 */
export async function cleanupThreadAIDrafts({
  threadId,
  emailAccountId,
  provider,
  logger,
  excludeMessageId,
}: {
  threadId: string;
  emailAccountId: string;
  provider: EmailProvider;
  logger: Logger;
  excludeMessageId: string;
}) {
  logger.info("Starting cleanup of old AI drafts for thread");

  try {
    // Find draft actions that are still pending, or where the user replied
    // without using the draft and the old draft may still need cleanup.
    // Excludes drafts for the current message to avoid deleting a draft that was just created
    const potentialDraftsToClean = await prisma.executedAction.findMany({
      where: {
        executedRule: {
          emailAccountId,
          threadId: threadId,
          messageId: { not: excludeMessageId },
        },
        type: ActionType.DRAFT_EMAIL,
        draftId: { not: null },
        draftStatus: {
          in: [
            DraftEmailStatus.PENDING,
            DraftEmailStatus.REPLIED_WITHOUT_DRAFT,
          ],
        },
      },
      select: {
        id: true,
        draftId: true,
        draftStatus: true,
        content: true,
      },
    });

    if (potentialDraftsToClean.length === 0) {
      logger.info("No relevant old AI drafts found to cleanup");
      return;
    }

    logger.info("Found potential AI drafts to check for cleanup", {
      potentialDraftsToCleanLength: potentialDraftsToClean.length,
    });

    for (const action of potentialDraftsToClean) {
      if (!action.draftId) continue; // Not expected to happen, but to fix TS error

      const actionLoggerOptions = {
        executedActionId: action.id,
        draftId: action.draftId,
      };
      try {
        const draftDetails = await provider.getDraft(action.draftId);

        logger.info("Fetched draft details for cleanup check", {
          ...actionLoggerOptions,
          draftExists: !!draftDetails,
          draftEmbeddedMessageId: draftDetails?.id,
          draftThreadId: draftDetails?.threadId,
          hasTextPlain: !!draftDetails?.textPlain,
          hasTextHtml: !!draftDetails?.textHtml,
        });
        logger.trace("Draft content preview", {
          ...actionLoggerOptions,
          draftTextPreview: (
            draftDetails?.textPlain || draftDetails?.textHtml
          )?.slice(0, 100),
        });

        if (draftDetails?.textPlain || draftDetails?.textHtml) {
          // Draft exists, check if modified
          // Pass full draftDetails to properly handle Outlook HTML content
          const similarityScore = calculateSimilarity(
            action.content,
            draftDetails,
          );
          const isUnmodified = action.content
            ? isDraftUnmodified({
                originalContent: action.content,
                currentDraft: draftDetails,
                logger,
              })
            : false;

          logger.info("Checked existing draft for modification", {
            ...actionLoggerOptions,
            draftEmbeddedMessageId: draftDetails.id,
            similarityScore,
            isUnmodified,
          });
          logger.trace("Original content preview for similarity check", {
            ...actionLoggerOptions,
            originalContentPreview: action.content?.slice(0, 100),
          });

          if (isUnmodified) {
            logger.info("Draft is unmodified, proceeding with deletion", {
              ...actionLoggerOptions,
              draftEmbeddedMessageId: draftDetails.id,
              draftThreadId: draftDetails.threadId,
            });
            const statusData = getDraftCleanupStatusData({
              draftStatus: action.draftStatus,
              status: DraftEmailStatus.CLEANED_UP_UNUSED,
            });
            await Promise.all([
              provider.deleteDraft(action.draftId),
              statusData
                ? withPrismaRetry(
                    () =>
                      prisma.executedAction.update({
                        where: { id: action.id },
                        data: statusData,
                      }),
                    { logger },
                  )
                : Promise.resolve(),
            ]);
            logger.info("Deleted unmodified draft.", actionLoggerOptions);
          } else {
            logger.info(
              "Draft has been modified, skipping deletion.",
              actionLoggerOptions,
            );
          }
        } else {
          logger.info(
            "Draft no longer exists, tracking cleanup status.",
            actionLoggerOptions,
          );
          const statusData = getDraftCleanupStatusData({
            draftStatus: action.draftStatus,
            status: DraftEmailStatus.MISSING_FROM_PROVIDER,
          });
          if (statusData) {
            await withPrismaRetry(
              () =>
                prisma.executedAction.update({
                  where: { id: action.id },
                  data: statusData,
                }),
              { logger },
            );
          }
        }
      } catch (error) {
        await logReplyTrackerError({
          logger,
          emailAccountId,
          scope: "draft-tracking",
          message: "Error checking draft for cleanup",
          operation: "check-draft-for-cleanup",
          context: actionLoggerOptions,
          error,
        });
      }
    }

    // Also clean up follow-up drafts for this thread (safety net).
    // clearFollowUpLabel already handles this synchronously, so this will
    // typically find nothing. Kept as a fallback for non-standard code paths.
    const followUpTrackers = await prisma.threadTracker.findMany({
      where: {
        emailAccountId,
        threadId,
        followUpDraftId: { not: null },
      },
      select: {
        id: true,
        followUpDraftId: true,
      },
    });

    if (followUpTrackers.length > 0) {
      logger.info("Found follow-up drafts to cleanup", {
        count: followUpTrackers.length,
      });

      for (const tracker of followUpTrackers) {
        if (!tracker.followUpDraftId) continue;

        try {
          await provider.deleteDraft(tracker.followUpDraftId);
          await prisma.threadTracker.update({
            where: { id: tracker.id },
            data: { followUpDraftId: null },
          });
          logger.info("Deleted follow-up draft", {
            trackerId: tracker.id,
            draftId: tracker.followUpDraftId,
          });
        } catch (error) {
          logger.error("Error deleting follow-up draft", {
            trackerId: tracker.id,
            draftId: tracker.followUpDraftId,
            error,
          });
        }
      }
    }

    logger.info("Completed cleanup of AI drafts for thread");
  } catch (error) {
    logger.error("Error during thread draft cleanup", { error });
  }
}

function queueReplyMemoryLearning({
  emailAccountId,
  executedActionId,
  draftSendLogId,
  draftText,
  sentText,
  similarityScore,
  provider,
  logger,
}: {
  emailAccountId: string;
  executedActionId: string;
  draftSendLogId: string;
  draftText?: string | null;
  sentText: string | null;
  similarityScore: number;
  provider: EmailProvider;
  logger: Logger;
}) {
  if (!draftText || !sentText) return;

  const replyMemorySentText = sentText.slice(0, 4000);

  if (
    !isMeaningfulDraftEdit({
      draftText,
      sentText: replyMemorySentText,
      similarityScore,
    })
  ) {
    return;
  }

  after(async () => {
    try {
      await saveDraftSendLogReplyMemory({
        draftSendLogId,
        sentText: replyMemorySentText,
      });
      await syncReplyMemoriesFromDraftSendLogs({
        emailAccountId,
        provider,
        logger,
      });
    } catch (error) {
      logger.error("Failed to learn reply memories from draft edit", {
        error,
        executedActionId,
      });
    }
  });
}

function getSentReplyText(message: ParsedMessage): string | null {
  const sentText = emailToContentForAI(
    stripProviderSignatureFromParsedMessage(message),
    {
      maxLength: 0,
      extractReply: true,
      removeForwarded: true,
    },
  ).trim();

  return sentText || null;
}

function getDraftSendLogSimilarityMetadata({
  draftText,
  sentMessage,
  sentText,
  similarityScore,
  bodySimilarity,
  draftExists,
  sentMessageRepliesToSource,
  draftStatus,
  accountSignature,
}: {
  draftText?: string | null;
  sentMessage: ParsedMessage;
  sentText: string | null;
  similarityScore: number;
  bodySimilarity: BodySimilarityResult;
  draftExists: boolean;
  sentMessageRepliesToSource: boolean | null;
  draftStatus: DraftEmailStatus;
  accountSignature?: string | null;
}) {
  const draft = draftText ?? "";
  const sent = sentText ?? "";
  const draftLength = draft.length;
  const sentTextLength = sent.length;
  const textHtmlLength = sentMessage.textHtml?.length ?? 0;
  const textPlainLength = sentMessage.textPlain?.length ?? 0;
  const snippetLength = sentMessage.snippet?.length ?? 0;
  const draftHasReferralFooter = hasReferralSignature(draft);
  const sentHasReferralFooter = hasReferralSignature(sent);
  const draftHasHtml = looksLikeHtml(draft);

  const signals: string[] = [];
  if (sentTextLength === 0) signals.push("empty_sent_text");
  if (textHtmlLength === 0 && textPlainLength === 0) {
    signals.push(
      snippetLength > 0 ? "snippet_only_sent_body" : "missing_sent_body",
    );
  }
  if (draftHasHtml) signals.push("draft_contains_html");
  if (draftHasReferralFooter) signals.push("draft_contains_referral_footer");
  if (sentHasReferralFooter) signals.push("sent_contains_referral_footer");
  if (accountSignature?.trim()) signals.push("account_signature_configured");
  if (draftLength > 0 && sentTextLength > 0) {
    if (sentTextLength < draftLength * 0.35) {
      signals.push("sent_much_shorter_than_draft");
    } else if (sentTextLength > draftLength * 2) {
      signals.push("sent_much_longer_than_draft");
    }
  }

  return {
    version: 2,
    score: roundMetric(similarityScore),
    bodyScore:
      bodySimilarity.score === null ? null : roundMetric(bodySimilarity.score),
    bodyScoreStatus: bodySimilarity.status,
    draft: {
      length: draftLength,
      hasHtml: draftHasHtml,
      hasReferralFooter: draftHasReferralFooter,
      comparableBodyLength: bodySimilarity.comparableDraftLength,
      configuredSignatureLength: accountSignature?.trim().length ?? 0,
    },
    sent: {
      bodyContentType: sentMessage.bodyContentType ?? null,
      selectedBodySource: bodySimilarity.selectedBodySource,
      textHtmlLength,
      textPlainLength,
      snippetLength,
      extractedReplyLength: sentTextLength,
      extractedReplyEmpty: sentTextLength === 0,
      comparableBodyLength: bodySimilarity.comparableSentLength,
      fullBodyAvailable: bodySimilarity.fullSentBodyAvailable,
    },
    lifecycle: {
      draftExists,
      sentMessageRepliesToSource,
      draftStatus,
    },
    diagnostics: {
      sentToDraftLengthRatio:
        draftLength > 0 ? roundMetric(sentTextLength / draftLength) : null,
      lengthDirection: getDraftSentLengthDirection({
        draftLength,
        sentTextLength,
      }),
      scorePollutionSignals: signals,
    },
  } satisfies Prisma.InputJsonObject;
}

type BodySimilarityResult = {
  score: number | null;
  status: BodySimilarityStatus;
  comparableDraftLength: number;
  comparableSentLength: number;
  fullSentBodyAvailable: boolean;
  selectedBodySource: ReturnType<typeof getSelectedProviderBodySource>;
};

function getBodySimilarityResult({
  draftText,
  sentMessage,
  sentText,
  accountSignature,
}: {
  draftText?: string | null;
  sentMessage: ParsedMessage;
  sentText: string | null;
  accountSignature?: string | null;
}): BodySimilarityResult {
  const selectedBodySource = getSelectedProviderBodySource(sentMessage);
  const comparableDraftText = stripReferralSignature(draftText ?? "");
  const comparableSentText = stripReferralSignature(sentText ?? "");
  const base = {
    comparableDraftLength: comparableDraftText.length,
    comparableSentLength: comparableSentText.length,
    fullSentBodyAvailable:
      selectedBodySource === "html" || selectedBodySource === "plain",
    selectedBodySource,
  };

  const unscoredStatus = getUnscorableBodySimilarityStatus({
    selectedBodySource,
    comparableDraftText,
    comparableSentText,
  });
  if (unscoredStatus) {
    return { ...base, score: null, status: unscoredStatus };
  }

  return {
    ...base,
    score: calculateSimilarity(comparableDraftText, comparableSentText, {
      excludedSignatures: accountSignature ? [accountSignature] : [],
    }),
    status: BODY_SIMILARITY_STATUS.SCORED,
  };
}

function getUnscorableBodySimilarityStatus({
  selectedBodySource,
  comparableDraftText,
  comparableSentText,
}: {
  selectedBodySource: ReturnType<typeof getSelectedProviderBodySource>;
  comparableDraftText: string;
  comparableSentText: string;
}) {
  if (selectedBodySource === "none")
    return BODY_SIMILARITY_STATUS.MISSING_SENT_BODY;
  if (selectedBodySource === "snippet")
    return BODY_SIMILARITY_STATUS.SNIPPET_ONLY_SENT_BODY;
  if (!comparableSentText.trim()) return BODY_SIMILARITY_STATUS.EMPTY_SENT_TEXT;
  if (!comparableDraftText.trim())
    return BODY_SIMILARITY_STATUS.MISSING_DRAFT_TEXT;
  return null;
}

function getSelectedProviderBodySource(message: ParsedMessage) {
  if (message.textHtml) return "html";
  if (message.textPlain) return "plain";
  if (message.snippet) return "snippet";
  return "none";
}

function getDraftSentLengthDirection({
  draftLength,
  sentTextLength,
}: {
  draftLength: number;
  sentTextLength: number;
}) {
  if (sentTextLength === 0) return "empty_sent_text";
  if (draftLength === 0) return "missing_draft_text";
  if (sentTextLength < draftLength * 0.65) return "user_shortened";
  if (sentTextLength > draftLength * 1.35) return "user_lengthened";
  return "similar_length";
}

function looksLikeHtml(value: string) {
  return /<\/?[a-z][\s\S]*>/i.test(value);
}

function roundMetric(value: number) {
  return Math.round(value * 1000) / 1000;
}

function getSentDraftStatus({
  similarityScore,
  sentMessageRepliesToSource,
}: {
  similarityScore: number;
  sentMessageRepliesToSource: boolean | null;
}): DraftEmailStatus {
  if (
    sentMessageRepliesToSource ||
    similarityScore >= DRAFT_SENT_SIMILARITY_THRESHOLD
  ) {
    return DraftEmailStatus.LIKELY_SENT;
  }
  return DraftEmailStatus.REPLIED_WITHOUT_DRAFT;
}

function isDraftSentStatus(status: DraftEmailStatus): boolean {
  return status === DraftEmailStatus.LIKELY_SENT;
}

function getDraftCleanupStatusData({
  draftStatus,
  status,
}: {
  draftStatus?: DraftEmailStatus | null;
  status: DraftEmailStatus;
}): { draftStatus: DraftEmailStatus } | null {
  if (
    draftStatus &&
    draftStatus !== DraftEmailStatus.PENDING &&
    draftStatus !== DraftEmailStatus.REPLIED_WITHOUT_DRAFT
  ) {
    return null;
  }
  return { draftStatus: status };
}
