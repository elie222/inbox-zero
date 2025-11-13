import type { OutlookClient } from "@/utils/outlook/client";
import { publishDelete, type TinybirdEmailAction } from "@inboxzero/tinybird";
import { createScopedLogger } from "@/utils/logger";
import { withOutlookRetry } from "@/utils/outlook/retry";

const logger = createScopedLogger("outlook/trash");

export async function trashThread(options: {
  client: OutlookClient;
  threadId: string;
  ownerEmail: string;
  actionSource: TinybirdEmailAction["actionSource"];
}) {
  const { client, threadId, ownerEmail, actionSource } = options;

  try {
    // In Outlook, trashing is moving to the Deleted Items folder
    // We need to move each message in the thread individually
    // Escape single quotes in threadId for the filter
    const escapedThreadId = threadId.replace(/'/g, "''");
    const messages = await client
      .getClient()
      .api("/me/messages")
      .filter(`conversationId eq '${escapedThreadId}'`)
      .get();

    const trashPromise = Promise.all(
      messages.value.map(async (message: { id: string }) => {
        try {
          return await withOutlookRetry(() =>
            client.getClient().api(`/me/messages/${message.id}/move`).post({
              destinationId: "deleteditems",
            }),
          );
        } catch (error) {
          // Log the error but don't fail the entire operation
          logger.warn("Failed to move message to trash", {
            messageId: message.id,
            threadId,
            error: error instanceof Error ? error.message : error,
          });
          return null;
        }
      }),
    );

    const publishPromise = publishDelete({
      ownerEmail,
      threadId,
      actionSource,
      timestamp: Date.now(),
    });

    const [trashResult, publishResult] = await Promise.allSettled([
      trashPromise,
      publishPromise,
    ]);

    if (trashResult.status === "rejected") {
      const error = trashResult.reason as Error;
      if (error.message?.includes("Requested entity was not found")) {
        // thread doesn't exist, so it's already been deleted
        logger.warn("Failed to trash non-existent thread", {
          email: ownerEmail,
          threadId,
          error,
        });
        return { status: 200 };
      } else {
        logger.error("Failed to trash thread", {
          email: ownerEmail,
          threadId,
          error,
        });
        throw error;
      }
    }

    if (publishResult.status === "rejected") {
      logger.error("Failed to publish delete action", {
        email: ownerEmail,
        threadId,
        error: publishResult.reason,
      });
    }

    return { status: 200 };
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
        .api("/me/messages")
        .select("id")
        .get();

      // Filter messages by conversationId manually
      const threadMessages = messages.value.filter(
        (message: { conversationId: string }) =>
          message.conversationId === threadId,
      );

      if (threadMessages.length > 0) {
        // Move each message in the thread to the deleted items folder
        const movePromises = threadMessages.map(
          async (message: { id: string }) => {
            try {
              return await withOutlookRetry(() =>
                client.getClient().api(`/me/messages/${message.id}/move`).post({
                  destinationId: "deleteditems",
                }),
              );
            } catch (moveError) {
              // Log the error but don't fail the entire operation
              logger.warn("Failed to move message to trash", {
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
        await withOutlookRetry(() =>
          client.getClient().api(`/me/messages/${threadId}/move`).post({
            destinationId: "deleteditems",
          }),
        );
      }

      // Publish the delete action
      try {
        await publishDelete({
          ownerEmail,
          threadId,
          actionSource,
          timestamp: Date.now(),
        });
      } catch (publishError) {
        logger.error("Failed to publish delete action", {
          email: ownerEmail,
          threadId,
          error: publishError,
        });
      }

      return { status: 200 };
    } catch (directError) {
      logger.error("Failed to trash thread", {
        threadId,
        error: directError,
      });
      throw directError;
    }
  }
}
