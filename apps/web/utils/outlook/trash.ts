import type { OutlookClient } from "@/utils/outlook/client";
import { publishDelete, type TinybirdEmailAction } from "@inboxzero/tinybird";
import type { Logger } from "@/utils/logger";
import { runWithBoundedConcurrency } from "@/utils/async";
import { withOutlookRetry } from "@/utils/outlook/retry";
import { processThreadMessagesFallback } from "@/utils/outlook/thread-helpers";

const THREAD_TRASH_CONCURRENCY = 2;

export async function trashThread(options: {
  client: OutlookClient;
  threadId: string;
  ownerEmail: string;
  actionSource: TinybirdEmailAction["actionSource"];
  logger: Logger;
}) {
  const { client, threadId, ownerEmail, actionSource, logger } = options;

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

    const trashPromise = runWithBoundedConcurrency({
      items: messages.value.map((message: { id: string }) => message.id),
      concurrency: THREAD_TRASH_CONCURRENCY,
      run: async (messageId) => {
        try {
          return await withOutlookRetry(
            () =>
              client.getClient().api(`/me/messages/${messageId}/move`).post({
                destinationId: "deleteditems",
              }),
            logger,
          );
        } catch (error) {
          logger.warn("Failed to move message to trash", {
            messageId,
            threadId,
            error,
          });
          return null;
        }
      },
    });

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
                .post({ destinationId: "deleteditems" }),
            logger,
          ),
        noMessagesMessage:
          "No messages found for conversationId, skipping trash move",
      });

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
