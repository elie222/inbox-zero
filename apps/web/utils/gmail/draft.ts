import type { gmail_v1 } from "@googleapis/gmail";
import { createScopedLogger } from "@/utils/logger";
import { withGmailRetry } from "@/utils/gmail/retry";
import { parseMessage } from "@/utils/mail";

const logger = createScopedLogger("gmail/draft");

export async function getDraftDetails(draftId: string, gmail: gmail_v1.Gmail) {
  try {
    logger.info("Fetching draft details", { draftId });
    const response = await withGmailRetry(() =>
      gmail.users.drafts.get({
        userId: "me",
        id: draftId,
        format: "full", // Get the full message payload
      }),
    );

    if (!response.data.message) {
      logger.warn("Draft contains no message data", { draftId });
      return null;
    }

    const messageToParse = {
      ...response.data.message,
      id: response.data.message.id ?? draftId,
    };

    if (!messageToParse.payload) {
      logger.warn("Draft message has no payload, cannot parse content.", { draftId });
      return null;
    }

    const parsed = parseMessage(messageToParse as gmail_v1.Schema$Message & { payload: gmail_v1.Schema$MessagePart });

    logger.info("Successfully parsed draft details", { draftId });
    return {
      id: draftId,
      messageId: response.data.message.id,
      threadId: parsed.threadId,
      textPlain: parsed.textPlain,
    };
  } catch (error: any) {
    if (error.code === 404) {
      logger.warn("Draft not found when fetching details.", { draftId });
      return null;
    }
    logger.error("Failed to get draft details", { draftId, error });
    throw error;
  }
}

export async function deleteDraft(
  gmail: gmail_v1.Gmail,
  draftId: string,
) {
  try {
    logger.info("Deleting draft", { draftId });
    await gmail.users.drafts.delete({
      userId: "me",
      id: draftId,
    });
    logger.info("Successfully deleted draft", { draftId });
  } catch (error: any) {
    if (error.code === 404) {
      logger.warn("Draft not found or already deleted, skipping deletion.", {
        draftId,
      });
    } else {
      logger.error("Failed to delete draft", { draftId, error });
      throw error;
    }
  }
}
