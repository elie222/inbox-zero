import type { OutlookClient } from "@/utils/outlook/client";
import { withMicrosoftGraphWriteRetry } from "@/utils/microsoft/retry";
import {
  processThreadMessagesFallback,
  runThreadMessageMutation,
} from "@/utils/outlook/thread-helpers";
import type { Logger } from "@/utils/logger";

export async function markSpam(
  client: OutlookClient,
  threadId: string,
  logger: Logger,
) {
  await moveThreadToSpamState({
    client,
    threadId,
    destinationId: "junkemail",
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
  destinationId: "inbox" | "junkemail";
  logger: Logger;
  failureMessage: string;
  noMessagesMessage: string;
}) {
  try {
    const escapedThreadId = threadId.replace(/'/g, "''");
    const messages = await client
      .getClient()
      .api("/me/messages")
      .filter(`conversationId eq '${escapedThreadId}'`)
      .get();

    await runThreadMessageMutation({
      messageIds: messages.value.map((message: { id: string }) => message.id),
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
