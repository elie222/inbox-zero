import type { gmail_v1 } from "@googleapis/gmail";
import prisma from "@/utils/prisma";
import { ActionType } from "@prisma/client";
import { deleteDraft, getDraft } from "@/utils/gmail/draft";
import type { ExecutedRule } from "@prisma/client";
import type { Logger } from "@/utils/logger";

/**
 * Handles finding and potentially deleting a previous AI-generated draft for a thread.
 */
export async function handlePreviousDraftDeletion({
  gmail,
  executedRule,
  logger,
}: {
  gmail: gmail_v1.Gmail;
  executedRule: Pick<ExecutedRule, "id" | "threadId" | "emailAccountId">;
  logger: Logger;
}) {
  try {
    // Find the most recent previous executed action of type DRAFT_EMAIL for this thread
    const previousDraftAction = await prisma.executedAction.findFirst({
      where: {
        executedRule: {
          threadId: executedRule.threadId, // Match threadId
          emailAccountId: executedRule.emailAccountId, // Match emailAccountId for safety
        },
        type: ActionType.DRAFT_EMAIL,
        draftId: { not: null }, // Ensure it has a draftId
        executedRuleId: { not: executedRule.id }, // Explicitly exclude actions from the current rule execution
      },
      orderBy: {
        createdAt: "desc", // Get the most recent one
      },
      select: {
        id: true,
        draftId: true,
        content: true,
      },
    });

    if (previousDraftAction?.draftId) {
      logger.info("Found previous draft", {
        previousDraftId: previousDraftAction.draftId,
      });

      // Fetch the current state of the draft
      const currentDraftDetails = await getDraft(
        previousDraftAction.draftId,
        gmail,
      );

      if (currentDraftDetails?.textPlain) {
        // Basic comparison: Compare original content with current plain text
        const quoteHeaderRegex = /\n\nOn .* wrote:/;
        const currentReplyContent = currentDraftDetails.textPlain
          .split(quoteHeaderRegex)[0]
          ?.trim();
        const originalContent = previousDraftAction.content?.trim();

        logger.info("Comparing draft content", {
          original: originalContent,
          current: currentReplyContent,
        });

        if (originalContent === currentReplyContent) {
          logger.info("Draft content matches, deleting draft.");
          await deleteDraft(gmail, previousDraftAction.draftId);
        } else {
          logger.info("Draft content modified by user, skipping deletion.");
        }
      } else {
        logger.warn(
          "Could not fetch current draft details or content, skipping deletion.",
          { previousDraftId: previousDraftAction.draftId },
        );
      }
    } else {
      logger.info("No previous draft found for this thread to delete");
    }
  } catch (error) {
    logger.error("Error finding or deleting previous draft", { error });
    // Log error but continue, failing to delete shouldn't block execution
  }
}

/**
 * Updates the ExecutedAction record with the Gmail draft ID.
 */
export async function updateExecutedActionWithDraftId({
  actionId,
  draftId,
  logger,
}: {
  actionId: string;
  draftId: string;
  logger: Logger;
}) {
  try {
    await prisma.executedAction.update({
      where: { id: actionId },
      data: { draftId: draftId },
    });
    logger.info("Updated executed action with draft ID", { actionId, draftId });
  } catch (error) {
    logger.error("Failed to update executed action with draft ID", {
      actionId,
      draftId,
      error,
    });
    // Depending on requirements, you might want to re-throw or handle this error differently.
  }
}
