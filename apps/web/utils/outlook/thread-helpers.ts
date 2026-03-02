import type { OutlookClient } from "@/utils/outlook/client";
import type { Logger } from "@/utils/logger";

/**
 * Fetches messages by conversationId and applies an operation to each.
 * Used as a fallback when the OData $filter approach fails.
 */
export async function processThreadMessagesFallback({
  client,
  threadId,
  logger,
  messageHandler,
  noMessagesMessage,
}: {
  client: OutlookClient;
  threadId: string;
  logger: Logger;
  messageHandler: (messageId: string) => Promise<unknown>;
  noMessagesMessage: string;
}) {
  const messages = await client
    .getClient()
    .api("/me/messages")
    .select("id,conversationId")
    .get();

  const threadMessages = messages.value.filter(
    (message: { conversationId: string }) =>
      message.conversationId === threadId,
  );

  if (threadMessages.length > 0) {
    const results = await Promise.allSettled(
      threadMessages.map((message: { id: string }) =>
        messageHandler(message.id),
      ),
    );

    for (const [i, result] of results.entries()) {
      if (result.status === "rejected") {
        logger.warn("Failed to process message in thread fallback", {
          threadId,
          messageId: threadMessages[i].id,
          error: result.reason,
        });
      }
    }
  } else {
    logger.warn(noMessagesMessage, { threadId });
  }
}
