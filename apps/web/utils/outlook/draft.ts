import type { Message } from "@microsoft/microsoft-graph-types";
import type { OutlookClient } from "@/utils/outlook/client";
import type { Logger } from "@/utils/logger";
import { isNotFoundError } from "@/utils/outlook/errors";
import {
  convertMessage,
  getCategoryMap,
  getFolderIds,
} from "@/utils/outlook/message";
import { withOutlookRetry } from "@/utils/outlook/retry";

export async function getDraft({
  client,
  draftId,
  logger,
}: {
  client: OutlookClient;
  draftId: string;
  logger: Logger;
}) {
  try {
    const [response, folderIds, categoryMap] = await Promise.all([
      withOutlookRetry(
        () =>
          client
            .getClient()
            .api(`/me/messages/${draftId}`)
            .get() as Promise<Message>,
        logger,
      ),
      getFolderIds(client, logger),
      getCategoryMap(client, logger),
    ]);

    // Treat drafts in Deleted Items as deleted - return null
    // DELETE moves messages to Deleted Items, so this ensures getDraft returns null
    // after deleteDraft is called
    if (
      folderIds.deleteditems &&
      response.parentFolderId === folderIds.deleteditems
    ) {
      logger.info("Draft is in Deleted Items folder, treating as deleted.", {
        draftId,
      });
      return null;
    }

    const message = convertMessage(response, folderIds, categoryMap);
    return message;
  } catch (error) {
    if (isNotFoundError(error)) {
      logger.info("Draft not found, returning null.", { draftId });
      return null;
    }

    throw error;
  }
}

export async function deleteDraft({
  client,
  draftId,
  logger,
}: {
  client: OutlookClient;
  draftId: string;
  logger: Logger;
}) {
  try {
    logger.info("Deleting draft", { draftId });
    // DELETE moves the draft to Deleted Items folder
    // getDraft will return null for drafts in Deleted Items, treating them as deleted
    await withOutlookRetry(
      () => client.getClient().api(`/me/messages/${draftId}`).delete(),
      logger,
    );
    logger.info("Successfully deleted draft", { draftId });
  } catch (error) {
    if (isNotFoundError(error)) {
      logger.warn("Draft not found or already deleted, skipping deletion.", {
        draftId,
      });
      return;
    }

    logger.error("Failed to delete draft", { draftId, error });
    throw error;
  }
}
