import { extractEmailAddress } from "@/utils/email";
import { createScopedLogger } from "@/utils/logger";
import type { EmailProvider } from "@/utils/email/types";

const logger = createScopedLogger("reply-tracker/query");

/**
 * Checks if a user has ever sent a reply to a specific sender and counts received emails
 * using the EmailProvider API.
 * @param emailProvider The authenticated EmailProvider instance.
 * @param senderEmail The email address of the sender.
 * @param receivedThreshold The number of received emails to check against.
 * @returns An object containing `hasReplied` (boolean) and `receivedCount` (number, capped at receivedThreshold).
 */
export async function checkSenderReplyHistory(
  emailProvider: EmailProvider,
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
      emailProvider.checkIfReplySent(cleanSenderEmail),
      emailProvider.countReceivedMessages(cleanSenderEmail, receivedThreshold),
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
