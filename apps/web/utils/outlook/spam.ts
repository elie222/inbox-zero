import type { OutlookClient } from "@/utils/outlook/client";
import { withOutlookRetry } from "@/utils/outlook/retry";
import { processThreadMessagesFallback } from "@/utils/outlook/thread-helpers";
import type { Logger } from "@/utils/logger";

export async function markSpam(
  client: OutlookClient,
  threadId: string,
  logger: Logger,
) {
  try {
    // In Outlook, marking as spam is moving to the Junk Email folder
    // We need to move each message in the thread individually
    // Escape single quotes in threadId for the filter
    const escapedThreadId = threadId.replace(/'/g, "''");
    const messages = await client
      .getClient()
      .api("/me/messages")
      .filter(`conversationId eq '${escapedThreadId}'`)
      .get();

    // Move each message in the thread to the junk email folder
    const movePromises = messages.value.map(async (message: { id: string }) => {
      try {
        return await withOutlookRetry(
          () =>
            client.getClient().api(`/me/messages/${message.id}/move`).post({
              destinationId: "junkemail",
            }),
          logger,
        );
      } catch (error) {
        // Log the error but don't fail the entire operation
        logger.warn("Failed to move message to spam", {
          messageId: message.id,
          threadId,
          error,
        });
        return null;
      }
    });

    await Promise.allSettled(movePromises);
  } catch (error) {
    // If the filter fails, try a different approach
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
          withOutlookRetry(
            () =>
              client
                .getClient()
                .api(`/me/messages/${messageId}/move`)
                .post({ destinationId: "junkemail" }),
            logger,
          ),
        noMessagesMessage:
          "No messages found for conversationId, skipping spam move",
      });
    } catch (directError) {
      logger.error("Failed to mark message as spam", {
        threadId,
        error: directError,
      });
      throw directError;
    }
  }
}
