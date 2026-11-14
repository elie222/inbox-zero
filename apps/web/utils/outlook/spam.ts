import type { OutlookClient } from "@/utils/outlook/client";
import { withMicrosoftGraphWriteRetry } from "@/utils/outlook/retry";
import {
  listThreadMessages,
  OutlookThreadPaginationError,
  processThreadMessagesFallback,
  runThreadMessageMutation,
} from "@/utils/outlook/thread-helpers";
import type { Logger } from "@/utils/logger";
import { getOrCreateOutlookFolderIdByName } from "@/utils/outlook/folders";
import { getReviewBeforeDeleteLabel } from "@/utils/review-before-delete";

export async function markSpam(
  client: OutlookClient,
  threadId: string,
  logger: Logger,
  reviewLabel?: string,
) {
  const labelToUse = reviewLabel ?? getReviewBeforeDeleteLabel();
  let destinationId = "junkemail";

  if (labelToUse) {
    destinationId = await getOrCreateOutlookFolderIdByName(
      client,
      labelToUse,
      logger,
    );
  }

  await moveThreadToSpamState({
    client,
    threadId,
    destinationId,
    logger,
    failureMessage: "Failed to move message to spam",
    noMessagesMessage:
      "No messages found for conversationId, skipping spam move",
  });
}

export async function markNotSpam(
  client: OutlookClient,
  threadId: string,
  logger: Logger,
  _reviewLabel?: string,
) {
  await moveThreadToSpamState({
    client,
    threadId,
    destinationId: "inbox",
    logger,
    failureMessage: "Failed to move message out of spam",
    noMessagesMessage:
      "No messages found for conversationId, skipping not-spam move",
  });
}

async function moveThreadToSpamState({
  client,
  threadId,
  destinationId,
  logger,
  failureMessage,
  noMessagesMessage,
}: {
  client: OutlookClient;
  threadId: string;
  destinationId: string;
  logger: Logger;
  failureMessage: string;
  noMessagesMessage: string;
}) {
  try {
    const messages = await listThreadMessages({
      client,
      threadId,
      select: "id",
      logger,
    });

    await runThreadMessageMutation({
      messageIds: messages.map((message) => message.id),
      threadId,
      logger,
      messageHandler: (messageId) =>
        withMicrosoftGraphWriteRetry(
          () =>
            client.getClient().api(`/me/messages/${messageId}/move`).post({
              destinationId,
            }),
          logger,
        ),
      failureMessage,
      continueOnError: true,
      throwIfAllFail: true,
    });
  } catch (error) {
    if (error instanceof OutlookThreadPaginationError) throw error;
    logger.warn("Filter failed, trying alternative approach", {
      threadId,
      error,
    });

    try {
      await processThreadMessagesFallback({
        client,
        threadId,
        logger,
        messageHandler: (messageId) =>
          withMicrosoftGraphWriteRetry(
            () =>
              client
                .getClient()
                .api(`/me/messages/${messageId}/move`)
                .post({ destinationId }),
            logger,
          ),
        noMessagesMessage,
        throwIfAllFail: true,
      });
    } catch (directError) {
      logger.error(failureMessage, {
        threadId,
        error: directError,
      });
      throw directError;
    }
  }
}
