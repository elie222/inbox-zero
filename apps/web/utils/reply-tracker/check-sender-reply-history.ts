import type { gmail_v1 } from "@googleapis/gmail";
import { extractEmailAddress } from "@/utils/email";
import { createScopedLogger } from "@/utils/logger";
import { getMessages } from "@/utils/gmail/message";
import { EmailProvider } from "@/utils/email/provider";

const logger = createScopedLogger("reply-tracker/query");

/**
 * Checks if a user has ever sent a reply to a specific sender and counts received emails
 * using the Gmail API.
 * @param gmail The authenticated Gmail API client instance.
 * @param senderEmail The email address of the sender.
 * @param receivedThreshold The number of received emails to check against.
 * @returns An object containing `hasReplied` (boolean) and `receivedCount` (number, capped at receivedThreshold).
 */
export async function checkSenderReplyHistory(
  gmail: EmailProvider,
  senderEmail: string,
  receivedThreshold: number,
): Promise<{ hasReplied: boolean; receivedCount: number }> {
  const cleanSenderEmail = extractEmailAddress(senderEmail);
  if (!cleanSenderEmail) {
    logger.warn("Could not extract email from sender", { senderEmail });
    // Default to assuming a reply might be needed if email is invalid
    return { hasReplied: true, receivedCount: 0 };
  }

  try {
    // Run checks in parallel for efficiency
    const [hasReplied, receivedCount] = await Promise.all([
      checkIfReplySent(gmail, cleanSenderEmail),
      countReceivedMessages(gmail, cleanSenderEmail, receivedThreshold),
    ]).catch((error) => {
      logger.error("Timeout or error in parallel operations", {
        error,
        cleanSenderEmail,
      });
      return [true, 0] as const; // Safe defaults
    });

    logger.info("Sender reply history check final result", {
      senderEmail,
      cleanSenderEmail,
      hasReplied,
      receivedCount,
    });

    return { hasReplied, receivedCount };
  } catch (error) {
    // Catch potential errors from Promise.all or other unexpected issues
    logger.error("Overall error checking sender reply history", {
      error,
      senderEmail,
      cleanSenderEmail,
    });
    // Default to assuming a reply might be needed on error
    return { hasReplied: true, receivedCount: 0 };
  }
}

// Helper to check if a reply was sent to the sender
async function checkIfReplySent(
  gmail: gmail_v1.Gmail,
  cleanSenderEmail: string,
): Promise<boolean> {
  try {
    const query = `from:me to:${cleanSenderEmail} label:sent`;
    const response = await getMessages(gmail, { query, maxResults: 1 });
    const sent = (response.messages?.length ?? 0) > 0;
    logger.info("Checked for sent reply", { cleanSenderEmail, sent });
    return sent;
  } catch (error) {
    logger.error("Error checking if reply was sent", {
      error,
      cleanSenderEmail,
    });
    return true; // Default to true on error (safer for TO_REPLY filtering)
  }
}

// Helper to count messages received from the sender up to a threshold
async function countReceivedMessages(
  gmail: gmail_v1.Gmail,
  cleanSenderEmail: string,
  threshold: number,
): Promise<number> {
  try {
    const query = `from:${cleanSenderEmail}`;
    logger.info(`Checking received message count (up to ${threshold})`, {
      cleanSenderEmail,
      threshold,
    });

    // Fetch up to the threshold number of message IDs.
    const response = await getMessages(gmail, {
      query,
      maxResults: threshold,
    });
    const count = response.messages?.length ?? 0;

    logger.info("Received message count check result", {
      cleanSenderEmail,
      count,
    });
    return count;
  } catch (error) {
    logger.error("Error counting received messages", {
      error,
      cleanSenderEmail,
    });
    return 0; // Default to 0 on error
  }
}
