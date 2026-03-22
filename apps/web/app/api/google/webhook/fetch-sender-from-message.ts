import { extractEmailAddress } from "@/utils/email";
import type { EmailProvider } from "@/utils/email/types";
import {
  isGmailRateLimitExceededError,
  isGmailQuotaExceededError,
  isGmailInsufficientPermissionsError,
} from "@/utils/error";
import type { Logger } from "@/utils/logger";

export async function fetchSenderFromMessage(
  messageId: string,
  provider: EmailProvider,
  logger: Logger,
): Promise<string | null> {
  try {
    const parsedMessage = await provider.getMessage(messageId);
    return extractEmailAddress(parsedMessage.headers.from);
  } catch (error) {
    const errorObj = error as {
      message?: string;
      error?: { message?: string };
    };
    const errorMessage = errorObj?.message || errorObj?.error?.message;

    if (errorMessage === "Requested entity was not found.") {
      logger.warn("Message not found - may have been deleted", { messageId });
      return null;
    }

    if (isGmailRateLimitExceededError(error)) {
      logger.warn("Rate limit exceeded", { messageId });
      return null;
    }

    if (isGmailQuotaExceededError(error)) {
      logger.warn("Quota exceeded", { messageId });
      return null;
    }

    if (isGmailInsufficientPermissionsError(error)) {
      logger.warn("Insufficient permissions", { messageId });
      return null;
    }

    logger.error("Error getting sender from message", { messageId, error });
    return null;
  }
}
