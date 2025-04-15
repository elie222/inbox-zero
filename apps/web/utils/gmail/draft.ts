import type { gmail_v1 } from "@googleapis/gmail";
import { createScopedLogger } from "@/utils/logger";
import { parseMessage } from "@/utils/mail";
import type { MessageWithPayload } from "@/utils/types";

const logger = createScopedLogger("gmail/draft");

export async function getDraft(draftId: string, gmail: gmail_v1.Gmail) {
  try {
    logger.info("Fetching draft details", { draftId });
    const response = await gmail.users.drafts.get({
      userId: "me",
      id: draftId,
      format: "full",
    });

    if (!response.data.message) {
      logger.warn("Draft contains no message data", { draftId });
      return null;
    }

    const message = parseMessage(response.data.message as MessageWithPayload);

    logger.info("Successfully parsed draft details", { draftId });
    return message;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === 404) {
      logger.warn("Draft not found when fetching details.", { draftId });
      return null;
    }
    logger.error("Failed to get draft details", { draftId, error });
    throw error;
  }
}

export async function deleteDraft(gmail: gmail_v1.Gmail, draftId: string) {
  try {
    logger.info("Deleting draft", { draftId });
    const response = await gmail.users.drafts.delete({
      userId: "me",
      id: draftId,
    });
    if (response.status !== 200) {
      logger.error("Failed to delete draft", { draftId, response });
    }
    logger.info("Successfully deleted draft", { draftId });
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === 404) {
      logger.warn("Draft not found or already deleted, skipping deletion.", {
        draftId,
      });
    } else {
      logger.error("Failed to delete draft", { draftId, error });
      throw error;
    }
  }
}
