import prisma from "@/utils/prisma";
import { ActionType } from "@prisma/client";
import type { ExecutedRule } from "@prisma/client";
import type { Logger } from "@/utils/logger";
import type { EmailProvider } from "@/utils/email/provider";

/**
 * Handles finding and potentially deleting a previous AI-generated draft for a thread.
 */
export async function handlePreviousDraftDeletion({
  client,
  executedRule,
  logger,
}: {
  client: EmailProvider;
  executedRule: Pick<ExecutedRule, "id" | "threadId" | "emailAccountId">;
  logger: Logger;
}) {
  try {
    // Find the most recent previous executed action of type DRAFT_EMAIL for this thread
    const previousDraftAction = await prisma.executedAction.findFirst({
      where: {
        executedRule: {
          threadId: executedRule.threadId,
          emailAccountId: executedRule.emailAccountId,
        },
        type: ActionType.DRAFT_EMAIL,
        draftId: { not: null }, // Ensure it has a draftId
        executedRuleId: { not: executedRule.id }, // Explicitly exclude current executedRule from the current rule execution
        draftSendLog: null, // Only consider drafts not logged as sent
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
      const currentDraftDetails = await client.getDraft(
        previousDraftAction.draftId,
      );

      if (currentDraftDetails?.textPlain) {
        // Basic comparison: Compare original content with current plain text
        // Try multiple quote header patterns
        const quoteHeaderPatterns = [
          /\n\nOn .* wrote:/,
          /\n\n----+ Original Message ----+/,
          /\n\n>+ On .*/,
          /\n\nFrom: .*/,
        ];

        let currentReplyContent = currentDraftDetails.textPlain;
        for (const pattern of quoteHeaderPatterns) {
          const parts = currentReplyContent.split(pattern);
          if (parts.length > 1) {
            currentReplyContent = parts[0];
            break;
          }
        }
        currentReplyContent = currentReplyContent.trim();

        const originalContent = previousDraftAction.content?.trim();

        logger.info("Comparing draft content", {
          original: originalContent,
          current: currentReplyContent,
        });

        if (originalContent === currentReplyContent) {
          logger.info("Draft content matches, deleting draft.");

          // Delete the draft and mark as not sent
          await Promise.all([
            client.deleteDraft(previousDraftAction.draftId),
            prisma.executedAction.update({
              where: { id: previousDraftAction.id },
              data: { wasDraftSent: false },
            }),
          ]);

          logger.info("Deleted draft and updated action status.");
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
      data: { draftId },
    });
    logger.info("Updated executed action with draft ID", { actionId, draftId });
  } catch (error) {
    logger.error("Failed to update executed action with draft ID", {
      actionId,
      draftId,
      error,
    });
  }
}
