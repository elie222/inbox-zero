import prisma from "@/utils/prisma";
import { fetchMessagesAndGenerateDraft } from "@/utils/reply-tracker/generate-draft";
import type { EmailProvider } from "@/utils/email/types";
import type { Logger } from "@/utils/logger";
import type { EmailAccountWithAI } from "@/utils/llms/types";

/**
 * Generates a follow-up draft for a thread that's awaiting a reply.
 * This is used when the cron job detects threads past their follow-up threshold.
 */
export async function generateFollowUpDraft({
  emailAccountId,
  threadId,
  provider,
  logger,
}: {
  emailAccountId: string;
  threadId: string;
  provider: EmailProvider;
  logger: Logger;
}): Promise<void> {
  logger.info("Generating follow-up draft", { threadId });

  // Get the email account with AI settings
  const emailAccount = await prisma.emailAccount.findUnique({
    where: { id: emailAccountId },
    select: {
      id: true,
      email: true,
      about: true,
      userId: true,
      multiRuleSelectionEnabled: true,
      timezone: true,
      calendarBookingLink: true,
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

  if (!emailAccount) {
    logger.error("Email account not found", { emailAccountId });
    return;
  }

  const emailAccountWithAI: EmailAccountWithAI = emailAccount;

  try {
    // Get the thread to find the last message
    const thread = await provider.getThread(threadId);
    if (!thread.messages?.length) {
      logger.warn("Thread has no messages", { threadId });
      return;
    }

    const lastMessage = thread.messages[thread.messages.length - 1];

    // Generate the draft content using existing infrastructure
    const draftContent = await fetchMessagesAndGenerateDraft(
      emailAccountWithAI,
      threadId,
      provider,
      undefined, // no test message
      logger,
    );

    // Create the draft in the email provider
    const { draftId } = await provider.draftEmail(
      lastMessage,
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
