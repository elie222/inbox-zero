import { fetchMessagesAndGenerateDraft } from "@/utils/reply-tracker/generate-draft";
import type { EmailProvider } from "@/utils/email/types";
import type { Logger } from "@/utils/logger";
import type { EmailAccountWithAI } from "@/utils/llms/types";
import { extractEmailAddress } from "@/utils/email";

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

    const draftContent = await fetchMessagesAndGenerateDraft(
      emailAccount,
      threadId,
      provider,
      undefined, // no test message
      logger,
    );

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
