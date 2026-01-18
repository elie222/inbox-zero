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

    // Get folder IDs to check deletion status
    const folderIds = await getFolderIds(client, logger);

    // DELETE moves the draft to Deleted Items folder
    await withOutlookRetry(
      () => client.getClient().api(`/me/messages/${draftId}`).delete(),
      logger,
    );

    // Verify the draft was deleted or moved out of Drafts folder
    try {
      const response = (await withOutlookRetry(
        () =>
          client
            .getClient()
            .api(`/me/messages/${draftId}`)
            .get() as Promise<Message>,
        logger,
      )) as Message;

      if (response.parentFolderId === folderIds.drafts) {
        // Draft is still in Drafts folder - try moving it to Deleted Items explicitly
        logger.warn(
          "Draft still in Drafts folder after DELETE, trying explicit move",
          { draftId },
        );

        if (folderIds.deleteditems) {
          await withOutlookRetry(
            () =>
              client
                .getClient()
                .api(`/me/messages/${draftId}/move`)
                .post({ destinationId: folderIds.deleteditems }),
            logger,
          );
          logger.info("Successfully moved draft to Deleted Items", { draftId });
        }
      }
      // If draft is not in Drafts folder, it was successfully deleted/moved
    } catch (verifyError) {
      // If we can't get the draft, it was deleted successfully
      if (!isNotFoundError(verifyError)) {
        logger.warn("Could not verify draft deletion", {
          draftId,
          error: verifyError,
        });
      }
    }
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
