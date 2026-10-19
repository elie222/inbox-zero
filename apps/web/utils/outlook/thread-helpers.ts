import type { OutlookClient } from "@/utils/outlook/client";
import type { Logger } from "@/utils/logger";
import { runWithBoundedConcurrency } from "@/utils/async";
import { escapeODataString } from "@/utils/outlook/odata-escape";
import { withMicrosoftGraphRetry } from "@/utils/outlook/retry";

const OUTLOOK_THREAD_WRITE_CONCURRENCY = 3;

// Graph pages at 10 messages by default, which would silently leave the rest of
// a long thread untouched. Pages beyond this are followed via @odata.nextLink.
const THREAD_MESSAGE_PAGE_SIZE = 100;
const MAX_THREAD_MESSAGE_PAGES = 20;

/**
 * Lists every message in a conversation, following Graph's paging.
 * `filter` is ANDed with the conversation filter, e.g. to scope to a folder.
 */
export async function listThreadMessages<
  T extends { id?: string | null } = { id: string },
>({
  client,
  threadId,
  logger,
  select = "id",
  filter,
}: {
  client: OutlookClient;
  threadId: string;
  logger: Logger;
  select?: string;
  filter?: string;
}): Promise<T[]> {
  const conversationFilter = `conversationId eq '${escapeODataString(threadId)}'`;
  const messages: T[] = [];
  let nextLink: string | undefined;

  for (let page = 0; page < MAX_THREAD_MESSAGE_PAGES; page++) {
    const response: { value: T[]; "@odata.nextLink"?: string } =
      await withMicrosoftGraphRetry(
        () =>
          nextLink
            ? client.getClient().api(nextLink).get()
            : client
                .getClient()
                .api("/me/messages")
                .filter(
                  filter
                    ? `${conversationFilter} and ${filter}`
                    : conversationFilter,
                )
                .select(select)
                .top(THREAD_MESSAGE_PAGE_SIZE)
                .get(),
        logger,
      );

    messages.push(...response.value);

    nextLink = response["@odata.nextLink"];
    if (!nextLink) break;
  }

  if (nextLink) {
    logger.warn("Stopped paging thread messages at the page limit", {
      threadId,
      messageCount: messages.length,
    });
  }

  return messages;
}

export async function runThreadMessageMutation({
  messageIds,
  threadId,
  logger,
  messageHandler,
  failureMessage,
  continueOnError = false,
  throwIfAllFail = false,
}: {
  messageIds: string[];
  threadId: string;
  logger: Logger;
  messageHandler: (messageId: string) => Promise<unknown>;
  failureMessage: string;
  continueOnError?: boolean;
  throwIfAllFail?: boolean;
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

  const firstFailure = failures[0];
  if (!firstFailure) return;
  const reason = firstFailure.result.reason;
  const error = reason instanceof Error ? reason : new Error(String(reason));

  if (!continueOnError) {
    throw error;
  }
  if (throwIfAllFail && failures.length === messageIds.length) {
    throw error;
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
  throwIfAllFail = false,
}: {
  client: OutlookClient;
  threadId: string;
  logger: Logger;
  messageHandler: (messageId: string) => Promise<unknown>;
  noMessagesMessage: string;
  throwIfAllFail?: boolean;
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
      throwIfAllFail,
    });
  } else {
    logger.warn(noMessagesMessage, { threadId });
  }
}
