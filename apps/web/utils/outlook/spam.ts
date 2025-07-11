import type { OutlookClient } from "@/utils/outlook/client";
import { createScopedLogger } from "@/utils/logger";

const logger = createScopedLogger("outlook/spam");

export async function markSpam(client: OutlookClient, threadId: string) {
  try {
    // In Outlook, marking as spam is moving to the Junk Email folder
    // We need to move each message in the thread individually
    // Escape single quotes in threadId for the filter
    const escapedThreadId = threadId.replace(/'/g, "''");
    const messages = await client
      .getClient()
      .api(`/me/messages`)
      .filter(`conversationId eq '${escapedThreadId}'`)
      .get();

    // Move each message in the thread to the junk email folder
    const movePromises = messages.value.map(async (message: { id: string }) => {
      try {
        return await client
          .getClient()
          .api(`/me/messages/${message.id}/move`)
          .post({
            destinationId: "junkemail",
          });
      } catch (error) {
        // Log the error but don't fail the entire operation
        logger.warn("Failed to move message to spam", {
          messageId: message.id,
          threadId,
          error: error instanceof Error ? error.message : error,
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
      // Try to get messages by conversationId using a different endpoint
      const messages = await client
        .getClient()
        .api(`/me/messages`)
        .select("id")
        .get();

      // Filter messages by conversationId manually
      const threadMessages = messages.value.filter(
        (message: { conversationId: string }) =>
          message.conversationId === threadId,
      );

      if (threadMessages.length > 0) {
        // Move each message in the thread to the junk email folder
        const movePromises = threadMessages.map(
          async (message: { id: string }) => {
            try {
              return await client
                .getClient()
                .api(`/me/messages/${message.id}/move`)
                .post({
                  destinationId: "junkemail",
                });
            } catch (moveError) {
              // Log the error but don't fail the entire operation
              logger.warn("Failed to move message to spam", {
                messageId: message.id,
                threadId,
                error:
                  moveError instanceof Error ? moveError.message : moveError,
              });
              return null;
            }
          },
        );

        await Promise.allSettled(movePromises);
      } else {
        // If no messages found, try treating threadId as a messageId
        await client.getClient().api(`/me/messages/${threadId}/move`).post({
          destinationId: "junkemail",
        });
      }
    } catch (directError) {
      logger.error("Failed to mark message as spam", {
        threadId,
        error: directError,
      });
      throw directError;
    }
  }
}
