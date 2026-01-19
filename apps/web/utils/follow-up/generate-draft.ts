import type { EmailProvider } from "@/utils/email/types";
import type { Logger } from "@/utils/logger";
import type { EmailAccountWithAI } from "@/utils/llms/types";
import { aiDraftFollowUp } from "@/utils/ai/reply/draft-follow-up";
import { getWritingStyle } from "@/utils/user/get";
import { internalDateToDate } from "@/utils/date";
import { getEmailForLLM } from "@/utils/get-email-from-message";
import { extractEmailAddress } from "@/utils/email";
import prisma from "@/utils/prisma";
import { env } from "@/env";
import { getOrCreateReferralCode } from "@/utils/referral/referral-code";
import { generateReferralLink } from "@/utils/referral/referral-link";

/**
 * Generates a follow-up draft for a thread that's awaiting a reply.
 * This is used when the cron job detects threads past their follow-up threshold.
 */
export async function generateFollowUpDraft({
  emailAccount,
  threadId,
  provider,
  logger,
}: {
  emailAccount: EmailAccountWithAI;
  threadId: string;
  provider: EmailProvider;
  logger: Logger;
}): Promise<void> {
  logger.info("Generating follow-up draft", { threadId });

  try {
    const thread = await provider.getThread(threadId);
    if (!thread.messages?.length) {
      logger.warn("Thread has no messages", { threadId });
      return;
    }

    // Find the last message from an external sender (not the current user)
    const lastExternalMessage = thread.messages
      .slice()
      .reverse()
      .find(
        (msg) =>
          extractEmailAddress(msg.headers.from).toLowerCase() !==
          emailAccount.email.toLowerCase(),
      );

    if (!lastExternalMessage) {
      logger.info(
        "No external message found in thread, skipping draft generation",
        { threadId },
      );
      return;
    }

    // Convert messages to LLM format
    const messages = thread.messages.map((msg, index) => ({
      date: internalDateToDate(msg.internalDate),
      ...getEmailForLLM(msg, {
        maxLength: index === thread.messages!.length - 1 ? 2000 : 500,
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

    let draftContent = result;

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
      lastExternalMessage,
      {
        content: draftContent,
      },
      emailAccount.email,
      undefined, // no executed rule context for follow-up drafts
    );

    logger.info("Follow-up draft created", { threadId, draftId });
  } catch (error) {
    logger.error("Failed to generate follow-up draft", { threadId, error });
    throw error;
  }
}
