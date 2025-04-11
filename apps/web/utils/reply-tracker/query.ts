import { extractEmailAddress } from "@/utils/email";
import { createScopedLogger } from "@/utils/logger";

const logger = createScopedLogger("reply-tracker/query");

/**
 * Checks if a user has ever sent a reply to a specific sender and counts received emails.
 * @param userId The ID of the user.
 * @param senderEmail The email address of the sender.
 * @returns An object containing `hasReplied` (boolean) and `receivedCount` (number).
 */
export async function checkSenderReplyHistory(
  senderEmail: string,
): Promise<{ hasReplied: boolean; receivedCount: number }> {
  // TODO: Refactor this function to use Gmail API (users.history.list).
  // The current implementation querying EmailMessage is incorrect as we don't store sent emails.
  // We need to check the user's actual Gmail history to see if a message was ever sent TO the senderEmail.
  // This involves checking history records for messagesAdded where the message has the appropriate 'To' header and is not a draft.
  // Need to consider pagination and potential performance implications of history checks.
  // See gmail-api.mdc for guidelines on interacting with the Gmail API via wrappers.

  const cleanSenderEmail = extractEmailAddress(senderEmail);
  if (!cleanSenderEmail) {
    logger.warn("Could not extract email from sender", { senderEmail });
    // Default to assuming a reply might be needed if email is invalid
    return { hasReplied: true, receivedCount: 0 };
  }

  return { hasReplied: false, receivedCount: 0 };
}
