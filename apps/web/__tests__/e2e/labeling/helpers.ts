import type { EmailProvider } from "@/utils/email/types";
import type { ParsedMessage } from "@/utils/types";

/**
 * Finds a thread with at least minMessages messages from the inbox.
 * Looks through recent inbox messages and finds one with multiple messages in thread.
 */
export async function findThreadWithMultipleMessages(
  provider: EmailProvider,
  minMessages = 2,
): Promise<{ threadId: string; messages: ParsedMessage[] }> {
  const inboxMessages = await provider.getInboxMessages(50);

  // Group by threadId and find one with enough messages
  const threadIds = [...new Set(inboxMessages.map((m) => m.threadId))];

  for (const threadId of threadIds) {
    const messages = await provider.getThreadMessages(threadId);
    if (messages.length >= minMessages) {
      return { threadId, messages };
    }
  }

  throw new Error(
    `TEST PREREQUISITE NOT MET: No thread found with ${minMessages}+ messages. ` +
      "Send an email to the test account and reply to it to create a multi-message thread.",
  );
}
