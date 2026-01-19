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

    // Treat drafts NOT in Drafts folder as "deleted" - when a draft is sent or deleted,
    // it gets moved to another folder (Sent Items, Deleted Items, Outbox, etc.)
    // For draft cleanup purposes, we only care about drafts in the Drafts folder
    if (folderIds.drafts && response.parentFolderId !== folderIds.drafts) {
      logger.info("Draft is no longer in Drafts folder, treating as deleted.", {
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

    // DELETE moves the draft to Deleted Items folder (not permanently deleted)
    // This is fine - getDraft() treats drafts not in Drafts folder as "deleted"
    await withOutlookRetry(
      () => client.getClient().api(`/me/messages/${draftId}`).delete(),
      logger,
    );

    logger.info("Draft deleted successfully", { draftId });
  } catch (error) {
    if (isNotFoundError(error)) {
      logger.info("Draft not found or already deleted", { draftId });
      return;
    }

    logger.error("Failed to delete draft", { draftId, error });
    throw error;
  }
}
