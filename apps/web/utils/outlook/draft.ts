import type { Message } from "@microsoft/microsoft-graph-types";
import type { OutlookClient } from "@/utils/outlook/client";
import type { Logger } from "@/utils/logger";
import {
  isNotFoundError,
  isPreconditionFailedError,
} from "@/utils/outlook/errors";
import {
  convertMessage,
  getCategoryMap,
  getFolderIds,
} from "@/utils/outlook/message";
import {
  withMicrosoftGraphRetry,
  withMicrosoftGraphWriteRetry,
} from "@/utils/microsoft/retry";

export async function getDraft({
  client,
  draftId,
  logger,
}: {
  client: OutlookClient;
  draftId: string;
  logger: Logger;
}) {
  const [draft, categoryMap] = await Promise.all([
    getDraftMessage({ client, draftId, logger }),
    getCategoryMap(client, logger),
  ]);
  if (!draft) return null;

  return convertMessage(draft.message, draft.folderIds, categoryMap);
}

export async function getDraftReference({
  client,
  messageId,
  logger,
}: {
  client: OutlookClient;
  messageId: string;
  logger: Logger;
}): Promise<{ id: string; version: string } | null> {
  const draft = await getDraftMessage({
    client,
    draftId: messageId,
    logger,
  });
  if (!draft) return null;
  if (!draft.folderIds.drafts) {
    logger.warn("Could not verify the Outlook Drafts folder");
    return null;
  }

  const version = (draft.message as { "@odata.etag"?: string })["@odata.etag"];
  if (!version) {
    throw new Error("Draft response did not include a version");
  }

  return { id: messageId, version };
}

export async function sendDraft({
  client,
  draftId,
  logger,
}: {
  client: OutlookClient;
  draftId: string;
  logger: Logger;
}): Promise<{ messageId: string; threadId: string }> {
  logger.info("Sending draft", { draftId });

  // Send the draft - this moves it from Drafts to Sent Items
  // The message ID stays the same after sending
  await withMicrosoftGraphWriteRetry(
    () => client.getClient().api(`/me/messages/${draftId}/send`).post({}),
    logger,
  );

  // Get the sent message to retrieve the conversationId (threadId)
  const sentMessage = await withMicrosoftGraphRetry(
    () =>
      client
        .getClient()
        .api(`/me/messages/${draftId}`)
        .get() as Promise<Message>,
    logger,
  );

  const threadId = sentMessage.conversationId;
  if (!threadId) {
    throw new Error("Failed to get threadId from sent message");
  }

  logger.info("Draft sent successfully", {
    draftId,
    messageId: draftId,
    threadId,
  });

  return { messageId: draftId, threadId };
}

export async function deleteDraft({
  client,
  draftId,
  version,
  logger,
}: {
  client: OutlookClient;
  draftId: string;
  version: string;
  logger: Logger;
}): Promise<boolean> {
  try {
    logger.info("Deleting draft", { draftId });

    const request = client
      .getClient()
      .api(`/me/messages/${draftId}`)
      .header("If-Match", version);

    await withMicrosoftGraphWriteRetry(() => request.delete(), logger);

    logger.info("Draft deleted successfully", { draftId });
    return true;
  } catch (error) {
    if (isNotFoundError(error) || isPreconditionFailedError(error)) {
      logger.info("Draft no longer matches the deletable version", { draftId });
      return false;
    }

    logger.error("Failed to delete draft", { draftId, error });
    throw error;
  }
}

async function getDraftMessage({
  client,
  draftId,
  logger,
}: {
  client: OutlookClient;
  draftId: string;
  logger: Logger;
}) {
  try {
    const [message, folderIds] = await Promise.all([
      withMicrosoftGraphRetry(
        () =>
          client
            .getClient()
            .api(`/me/messages/${draftId}`)
            .get() as Promise<Message>,
        logger,
      ),
      getFolderIds(client, logger),
    ]);

    if (folderIds.drafts && message.parentFolderId !== folderIds.drafts) {
      logger.info("Draft is no longer in Drafts folder, treating as deleted.", {
        draftId,
      });
      return null;
    }

    return { message, folderIds };
  } catch (error) {
    if (isNotFoundError(error)) {
      logger.info("Draft not found, returning null.", { draftId });
      return null;
    }

    throw error;
  }
}
