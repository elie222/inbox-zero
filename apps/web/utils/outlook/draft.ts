import type { OutlookClient } from "@/utils/outlook/client";
import { createScopedLogger } from "@/utils/logger";
import { parseMessage } from "@/utils/mail";

const logger = createScopedLogger("outlook/draft");

export async function getDraft(draftId: string, client: OutlookClient) {
  try {
    const response = await client
      .getClient()
      .api(`/me/messages/${draftId}`)
      .get();
    const message = parseMessage(response);
    return message;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === 404)
      return null;
    throw error;
  }
}

export async function deleteDraft(client: OutlookClient, draftId: string) {
  try {
    logger.info("Deleting draft", { draftId });
    const response = await client
      .getClient()
      .api(`/me/messages/${draftId}`)
      .delete();
    if (response.status !== 204) {
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
