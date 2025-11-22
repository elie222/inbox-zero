import prisma from "@/utils/prisma";
import { ActionType } from "@/generated/prisma/enums";
import type { ExecutedRule } from "@/generated/prisma/client";
import type { Logger } from "@/utils/logger";
import type { EmailProvider } from "@/utils/email/types";
import { convertEmailHtmlToText } from "@/utils/mail";
import type { ParsedMessage } from "@/utils/types";

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

    if (!previousDraftAction?.draftId) {
      logger.info("No previous draft found for this thread to delete");
      return;
    }

    logger.info("Found previous draft", {
      previousDraftId: previousDraftAction.draftId,
    });

    const currentDraftDetails = await client.getDraft(
      previousDraftAction.draftId,
    );

    if (!currentDraftDetails?.textPlain) {
      logger.warn(
        "Could not fetch current draft details or content, skipping deletion.",
        { previousDraftId: previousDraftAction.draftId },
      );
      return;
    }

    const isUnmodified =
      !previousDraftAction.content ||
      isDraftUnmodified({
        originalContent: previousDraftAction.content,
        currentDraft: currentDraftDetails,
        logger,
      });

    if (isUnmodified) {
      logger.info("Draft content matches, deleting draft.");

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
  } catch (error) {
    logger.error("Error finding or deleting previous draft", {
      error: (error as Error)?.message || error,
    });
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

/**
 * Extracts plain text from a draft, handling both Gmail and Outlook formats.
 */
export function extractDraftPlainText(draft: ParsedMessage): string {
  if (draft.bodyContentType === "html") {
    return draft.textPlain
      ? convertEmailHtmlToText({
          htmlText: draft.textPlain,
          includeLinks: false,
        })
      : "";
  }
  return draft.textPlain || "";
}

/**
 * Removes quoted content from email text.
 */
export function stripQuotedContent(text: string): string {
  const quoteHeaderPatterns = [
    /\n\nOn .* wrote:/,
    /\n\n----+ Original Message ----+/,
    /\n\n>+ On .*/,
    /\n\nFrom: .*/,
  ];

  let result = text;
  for (const pattern of quoteHeaderPatterns) {
    const parts = result.split(pattern);
    if (parts.length > 1) {
      result = parts[0];
      break;
    }
  }

  return result.trim();
}

/**
 * Checks if a draft has been modified by comparing original and current content.
 */
export function isDraftUnmodified({
  originalContent,
  currentDraft,
  logger,
}: {
  originalContent: string;
  currentDraft: ParsedMessage;
  logger: Logger;
}): boolean {
  const currentText = extractDraftPlainText(currentDraft);
  const currentReplyContent = stripQuotedContent(currentText);

  const originalWithBr = originalContent.replace(/\n/g, "<br>");
  const originalContentPlain = convertEmailHtmlToText({
    htmlText: originalWithBr,
    includeLinks: false,
  });
  const originalContentTrimmed = originalContentPlain.trim();

  logger.trace("Comparing draft content", {
    original: originalContentTrimmed,
    current: currentReplyContent,
  });

  return originalContentTrimmed === currentReplyContent;
}
