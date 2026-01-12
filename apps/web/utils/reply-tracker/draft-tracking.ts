import { ActionType } from "@/generated/prisma/enums";
import type { ParsedMessage } from "@/utils/types";
import prisma from "@/utils/prisma";
import { withPrismaRetry } from "@/utils/prisma-retry";
import { calculateSimilarity } from "@/utils/similarity-score";
import type { EmailProvider } from "@/utils/email/types";
import type { Logger } from "@/utils/logger";

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
    },
  });

  if (!executedAction?.draftId) {
    logger.info("No corresponding AI draft action with draftId found");
    return;
  }

  const draftExists = await provider.getDraft(executedAction.draftId);

  if (draftExists) {
    logger.info("Original AI draft still exists, sent message was different.", {
      executedActionId: executedAction.id,
      draftId: executedAction.draftId,
    });
    // Mark the action to indicate its draft was not sent
    await withPrismaRetry(
      () =>
        prisma.executedAction.update({
          where: { id: executedAction.id },
          data: { wasDraftSent: false },
        }),
      { logger },
    );
    return;
  }

  logger.info(
    "Original AI draft not found (likely sent or deleted), proceeding to log similarity.",
    {
      executedActionId: executedAction.id,
      draftId: executedAction.draftId,
    },
  );

  const executedActionId = executedAction.id;

  // Pass full message to properly handle Outlook HTML content
  const similarityScore = calculateSimilarity(executedAction.content, message);

  logger.info("Calculated similarity score", {
    executedActionId,
    similarityScore,
  });

  await withPrismaRetry(
    () =>
      prisma.$transaction([
        prisma.draftSendLog.create({
          data: {
            executedActionId: executedActionId,
            sentMessageId: sentMessageId,
            similarityScore: similarityScore,
          },
        }),
        // Mark that the draft was sent
        prisma.executedAction.update({
          where: { id: executedActionId },
          data: { wasDraftSent: true },
        }),
      ]),
    { logger },
  );

  logger.info(
    "Successfully created draft send log and updated action status via transaction",
    { executedActionId },
  );
}

/**
 * Cleans up old, unmodified AI-generated drafts in a thread.
 * Finds drafts created by executed actions that haven't been logged as sent,
 * checks if they still exist and are unmodified, and deletes them.
 */
export async function cleanupThreadAIDrafts({
  threadId,
  emailAccountId,
  provider,
  logger,
}: {
  threadId: string;
  emailAccountId: string;
  provider: EmailProvider;
  logger: Logger;
}) {
  logger.info("Starting cleanup of old AI drafts for thread");

  try {
    // Find all draft actions for this thread that haven't resulted in a sent log
    const potentialDraftsToClean = await prisma.executedAction.findMany({
      where: {
        executedRule: {
          emailAccountId,
          threadId: threadId,
        },
        type: ActionType.DRAFT_EMAIL,
        draftId: { not: null },
        draftSendLog: null, // Only consider drafts not logged as sent
      },
      select: {
        id: true,
        draftId: true,
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

        if (draftDetails?.textPlain || draftDetails?.textHtml) {
          // Draft exists, check if modified
          // Pass full draftDetails to properly handle Outlook HTML content
          const similarityScore = calculateSimilarity(
            action.content,
            draftDetails,
          );
          const isUnmodified = similarityScore === 1.0;

          logger.info("Checked existing draft for modification", {
            ...actionLoggerOptions,
            similarityScore,
            isUnmodified,
          });

          if (isUnmodified) {
            logger.info(
              "Draft is unmodified, deleting...",
              actionLoggerOptions,
            );
            await Promise.all([
              provider.deleteDraft(action.draftId),
              // Mark as not sent (cleaned up because ignored/superseded)
              withPrismaRetry(
                () =>
                  prisma.executedAction.update({
                    where: { id: action.id },
                    data: { wasDraftSent: false },
                  }),
                { logger },
              ),
            ]);
            logger.info(
              "Deleted unmodified draft and updated action status.",
              actionLoggerOptions,
            );
          } else {
            logger.info(
              "Draft has been modified, skipping deletion.",
              actionLoggerOptions,
            );
          }
        } else {
          logger.info(
            "Draft no longer exists, marking as not sent.",
            actionLoggerOptions,
          );
          // Draft doesn't exist anymore, mark as not sent
          await withPrismaRetry(
            () =>
              prisma.executedAction.update({
                where: { id: action.id },
                data: { wasDraftSent: false },
              }),
            { logger },
          );
        }
      } catch (error) {
        logger.error("Error checking draft for cleanup", {
          ...actionLoggerOptions,
          error,
        });
      }
    }

    logger.info("Completed cleanup of old AI drafts for thread");
  } catch (error) {
    logger.error("Error during thread draft cleanup", { error });
  }
}
