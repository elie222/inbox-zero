import type { OutlookClient } from "@/utils/outlook/client";
import type { Logger } from "@/utils/logger";
import { runWithBoundedConcurrency } from "@/utils/async";

const OUTLOOK_THREAD_WRITE_CONCURRENCY = 3;

export async function runThreadMessageMutation({
  messageIds,
  threadId,
  logger,
  messageHandler,
  failureMessage,
  continueOnError = false,
}: {
  messageIds: string[];
  threadId: string;
  logger: Logger;
  messageHandler: (messageId: string) => Promise<unknown>;
  failureMessage: string;
  continueOnError?: boolean;
}) {
  if (messageIds.length === 0) return;

  const results = await runWithBoundedConcurrency({
    items: messageIds,
    concurrency: OUTLOOK_THREAD_WRITE_CONCURRENCY,
    run: (messageId) => messageHandler(messageId),
  });

  const failures = results.filter(
    (
      entry,
    ): entry is {
      item: string;
      result: PromiseRejectedResult;
    } => entry.result.status === "rejected",
  );

  for (const failure of failures) {
    logger.warn(failureMessage, {
      threadId,
      messageId: failure.item,
      error: failure.result.reason,
    });
  }

  if (!continueOnError && failures.length > 0) {
    throw failures[0].result.reason;
  }
}

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
    await runThreadMessageMutation({
      messageIds: threadMessages.map((message: { id: string }) => message.id),
      threadId,
      logger,
      messageHandler,
      failureMessage: "Failed to process message in thread fallback",
      continueOnError: true,
    });
  } else {
    logger.warn(noMessagesMessage, { threadId });
  }
}
