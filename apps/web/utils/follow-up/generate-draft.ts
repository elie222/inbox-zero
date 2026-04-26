import type { EmailProvider } from "@/utils/email/types";
import type { Logger } from "@/utils/logger";
import type { EmailAccountWithAI } from "@/utils/llms/types";
import { aiDraftFollowUp } from "@/utils/ai/reply/draft-follow-up";
import { getWritingStyle } from "@/utils/user/get";
import { internalDateToDate, sortByInternalDate } from "@/utils/date";
import { getEmailForLLM } from "@/utils/get-email-from-message";
import { isSameEmailAddress } from "@/utils/email";
import { escapeHtml } from "@/utils/string";
import prisma from "@/utils/prisma";
import { withPrismaRetry } from "@/utils/prisma-retry";
import { captureException } from "@/utils/error";
import { env } from "@/env";
import { getOrCreateReferralCode } from "@/utils/referral/referral-code";
import { generateReferralLink } from "@/utils/referral/referral-link";
import { shouldSkipAutoDraft } from "@/utils/auto-draft";

/**
 * Generates a follow-up draft for a thread that's awaiting a reply.
 * This is used when the cron job detects threads past their follow-up threshold.
 */
export async function generateFollowUpDraft({
  emailAccount,
  threadId,
  messageId,
  trackerId,
  provider,
  logger,
}: {
  emailAccount: EmailAccountWithAI;
  threadId: string;
  messageId: string;
  trackerId: string;
  provider: EmailProvider;
  logger: Logger;
}): Promise<void> {
  if (shouldSkipAutoDraft({ logger, source: "follow-up" })) return;

  logger.info("Generating follow-up draft", { threadId, messageId });

  try {
    const thread = await provider.getThread(threadId);
    if (!thread.messages?.length) {
      logger.warn("Thread has no messages", { threadId });
      return;
    }

    const threadMessages = [...thread.messages].sort(sortByInternalDate());
    const trackedMessage = threadMessages.find((msg) => msg.id === messageId);
    if (!trackedMessage) {
      logger.warn(
        "Skipping follow-up draft because the tracked message was not found in the thread",
        { threadId, messageId },
      );
      return;
    }

    const latestMessage = threadMessages.at(-1);
    if (latestMessage?.id !== trackedMessage.id) {
      logger.info(
        "Skipping follow-up draft because the tracked message is no longer the latest message in the thread",
        { threadId, messageId, latestMessageId: latestMessage?.id },
      );
      return;
    }

    if (!isMessageFromUser(trackedMessage, emailAccount.email)) {
      logger.info(
        "Skipping follow-up draft because the tracked message was not sent by the user",
        { threadId, messageId },
      );
      return;
    }

    const recipientOverride = trackedMessage.headers.to || undefined;

    // Convert messages to LLM format
    const messages = threadMessages.map((msg, index) => ({
      date: internalDateToDate(msg.internalDate),
      ...getEmailForLLM(msg, {
        maxLength: index === threadMessages.length - 1 ? 2000 : 500,
        extractReply: true,
        removeForwarded: false,
      }),
    }));

    const writingStyle = await getWritingStyle({
      emailAccountId: emailAccount.id,
    });

    const result = await aiDraftFollowUp({
      messages,
      emailAccount,
      writingStyle,
    });

    if (typeof result !== "string") {
      throw new Error("Follow-up draft result is not a string");
    }

    let draftContent = escapeHtml(result);

    // Add signatures
    const emailAccountWithSignatures = await prisma.emailAccount.findUnique({
      where: { id: emailAccount.id },
      select: {
        includeReferralSignature: true,
        signature: true,
      },
    });

    if (
      !env.NEXT_PUBLIC_DISABLE_REFERRAL_SIGNATURE &&
      emailAccountWithSignatures?.includeReferralSignature
    ) {
      const referralSignature = await getOrCreateReferralCode(
        emailAccount.userId,
      );
      const referralLink = generateReferralLink(referralSignature.code);
      const htmlSignature = `Drafted by <a href="${referralLink}">Inbox Zero</a>.`;
      draftContent = `${draftContent}\n\n${htmlSignature}`;
    }

    if (emailAccountWithSignatures?.signature) {
      draftContent = `${draftContent}\n\n${emailAccountWithSignatures.signature}`;
    }

    const { draftId } = await provider.draftEmail(
      trackedMessage,
      {
        to: recipientOverride,
        content: draftContent,
      },
      emailAccount.email,
      undefined,
    );

    // Store draftId in tracker so dedup can detect existing drafts.
    // Uses retry to maximize chance of success. Wrapped in its own try-catch
    // so a persistent failure doesn't block returning (draft was already created).
    try {
      await withPrismaRetry(
        () =>
          prisma.threadTracker.update({
            where: { id: trackerId },
            data: { followUpDraftId: draftId },
          }),
        { logger },
      );
    } catch (updateError) {
      logger.error(
        "Failed to update tracker with draftId, deleting orphaned draft",
        { threadId, draftId, trackerId, error: updateError },
      );
      captureException(updateError);
      try {
        await provider.deleteDraft(draftId);
      } catch (deleteError) {
        logger.error("Failed to delete orphaned draft", {
          threadId,
          draftId,
          error: deleteError,
        });
      }
    }

    logger.info("Follow-up draft created", { threadId, draftId });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    // Skip draft generation for messages that don't support replies
    // (e.g., calendar invites, meeting requests, delivery reports)
    if (errorMessage.includes("Item type is invalid for creating a Reply")) {
      logger.info(
        "Skipping draft generation - message type doesn't support replies",
        { threadId },
      );
      return;
    }

    logger.error("Failed to generate follow-up draft", { threadId, error });
    throw error;
  }
}

function isMessageFromUser(
  message: { headers: { from: string } },
  userEmail: string,
) {
  return isSameEmailAddress(message.headers.from, userEmail);
}
