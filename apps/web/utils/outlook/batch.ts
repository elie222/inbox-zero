import type { Logger } from "@/utils/logger";
import type { OutlookClient } from "@/utils/outlook/client";
import { escapeODataString } from "@/utils/outlook/odata-escape";
import { getFolderIds } from "@/utils/outlook/message";
import {
  publishBulkActionToTinybird,
  updateEmailMessagesForSender,
} from "@/utils/email/bulk-action-tracking";

const GRAPH_JSON_BATCH_LIMIT = 20; // Microsoft Graph JSON batching limit

type GraphBatchRequestItem<TBody = unknown> = {
  id: string;
  method: string;
  url: string;
  headers?: Record<string, string>;
  body?: TBody;
};

type GraphBatchResponseItem<TBody = unknown> = {
  id: string;
  status: number;
  headers?: Record<string, string>;
  body?: TBody | null;
};

type GraphBatchResponse<TBody = unknown> = {
  responses?: GraphBatchResponseItem<TBody>[];
};

type MoveMessagesBatchResult = {
  movedMessageIds: string[];
  hasErrors: boolean;
};

async function batch<TRequestBody = unknown, TResponseBody = unknown>({
  client,
  requests,
  onFailure,
  context,
  logger,
}: {
  client: OutlookClient;
  requests: GraphBatchRequestItem<TRequestBody>[];
  onFailure?: (params: {
    request?: GraphBatchRequestItem<TRequestBody>;
    response: GraphBatchResponseItem<TResponseBody>;
  }) => void;
  context?: Record<string, unknown>;
  logger: Logger;
}): Promise<GraphBatchResponseItem<TResponseBody>[]> {
  if (requests.length === 0) return [];

  const graphClient = client.getClient();
  const aggregatedResponses: GraphBatchResponseItem<TResponseBody>[] = [];

  for (
    let start = 0;
    start < requests.length;
    start += GRAPH_JSON_BATCH_LIMIT
  ) {
    const chunk = requests.slice(start, start + GRAPH_JSON_BATCH_LIMIT);

    try {
      const response = (await graphClient
        .api("/$batch")
        .post({ requests: chunk })) as GraphBatchResponse<TResponseBody>;

      const responses = response?.responses ?? [];
      const requestsById = new Map(
        chunk.map((request) => [request.id, request]),
      );

      responses.forEach((res) => {
        aggregatedResponses.push(res);
        if (res.status >= 400 && onFailure) {
          onFailure({
            request: requestsById.get(res.id),
            response: res,
          });
        }
      });
    } catch (error) {
      logger.error("Graph batch request failed", {
        ...context,
        chunkSize: chunk.length,
        error,
      });
      throw error;
    }
  }

  return aggregatedResponses;
}

async function moveMessagesInBatches({
  client,
  messageIds,
  destinationId,
  action,
  stopOnError = false,
  logger,
}: {
  client: OutlookClient;
  messageIds: string[];
  destinationId: string;
  action: "archive" | "trash";
  stopOnError?: boolean;
  logger: Logger;
}): Promise<MoveMessagesBatchResult> {
  if (messageIds.length === 0) {
    return { movedMessageIds: [], hasErrors: false };
  }

  const requestIdToMessageId = new Map<string, string>();
  const requests = messageIds.map((messageId, index) => {
    const requestId = `${action}-${index}`;
    requestIdToMessageId.set(requestId, messageId);

    return {
      id: requestId,
      method: "POST",
      url: `/me/messages/${messageId}/move`,
      headers: {
        "Content-Type": "application/json",
      },
      body: {
        destinationId,
      },
    };
  });

  const responses = await batch({
    client,
    requests,
    context: {
      action,
      destinationId,
      messageCount: messageIds.length,
    },
    logger,
    onFailure: ({ request, response }) => {
      const messageId = request ? requestIdToMessageId.get(request.id) : null;
      const body = response.body;
      const errorMessage =
        body && typeof body === "object" && body !== null && "error" in body
          ? (body as { error?: { message?: string } }).error?.message
          : body
            ? JSON.stringify(body)
            : undefined;

      logger.error("Failed to move message via batch", {
        action,
        messageId,
        status: response.status,
        error: errorMessage,
      });
    },
  });

  const movedMessageIds = responses.flatMap((response) => {
    if (response.status >= 400) return [];

    const messageId = requestIdToMessageId.get(response.id);
    return messageId ? [messageId] : [];
  });
  const hasErrors = responses.some((response) => response.status >= 400);

  if (hasErrors && stopOnError) {
    logger.error("Graph batch responses contain errors", {
      action,
      destinationId,
      errorCount: responses.filter((response) => response.status >= 400).length,
      messageCount: messageIds.length,
      statuses: responses
        .filter((response) => response.status >= 400)
        .map((response) => response.status),
    });
  }

  return {
    movedMessageIds,
    hasErrors,
  };
}

export async function moveMessagesForSenders({
  client,
  senders,
  destinationId,
  action,
  ownerEmail,
  emailAccountId,
  continueOnError = true,
  logger,
}: {
  client: OutlookClient;
  senders: string[];
  destinationId: string;
  action: "archive" | "trash";
  ownerEmail: string;
  emailAccountId: string;
  continueOnError?: boolean;
  logger: Logger;
}): Promise<number> {
  if (senders.length === 0) return 0;

  // Resolve the actual inbox folder ID for archive filtering
  // parentFolderId on messages is the real folder ID (a GUID), not the well-known name
  let inboxFolderId: string | undefined;
  if (action === "archive") {
    const folderIds = await getFolderIds(client, logger, {
      includeDrafts: false,
    });
    inboxFolderId = folderIds.inbox;
    if (!inboxFolderId) {
      logger.error(
        "Could not resolve inbox folder ID — aborting bulk archive to avoid archiving from all folders",
      );
      if (!continueOnError) {
        throw new Error("Could not resolve inbox folder ID for bulk archive");
      }
      return 0;
    }
  }

  let movedMessagesCount = 0;

  for (const sender of senders) {
    if (!sender) continue;

    const processedMessageIds = new Set<string>();
    const publishedThreadIds = new Set<string>();
    const fromFilter = `from/emailAddress/address eq '${escapeODataString(sender)}'`;
    const filterExpression = inboxFolderId
      ? `${fromFilter} and parentFolderId eq '${escapeODataString(inboxFolderId)}'`
      : fromFilter;

    // Use @odata.nextLink directly for pagination instead of extracting $skiptoken
    // This is more reliable as Microsoft Graph may use different token formats
    // See: https://learn.microsoft.com/en-us/graph/paging
    let nextLink: string | undefined;

    // Helper to fetch a page of messages
    const fetchPage = async (url?: string) => {
      if (url) {
        // Use the full @odata.nextLink URL for subsequent pages
        return client.getClient().api(url).get();
      }
      // First page: use fluent API
      return client
        .getClient()
        .api("/me/messages")
        .filter(filterExpression)
        .top(100)
        .select("id,conversationId")
        .get();
    };

    // Process all pages
    do {
      try {
        const response: {
          value?: Array<{ id?: string | null; conversationId?: string | null }>;
          "@odata.nextLink"?: string;
        } = await fetchPage(nextLink);

        const allMessages = (response.value ?? []).filter(
          (message): message is { id: string; conversationId: string } =>
            !!message.id &&
            !!message.conversationId &&
            !processedMessageIds.has(message.id),
        );

        const messageIds = allMessages.map((msg) => msg.id);

        if (messageIds.length > 0) {
          try {
            const { movedMessageIds, hasErrors } = await moveMessagesInBatches({
              client,
              messageIds,
              destinationId,
              action,
              stopOnError: !continueOnError,
              logger,
            });

            const movedMessageIdSet = new Set(movedMessageIds);
            const batchThreadIds = new Set(
              allMessages
                .filter((message) => movedMessageIdSet.has(message.id))
                .map((message) => message.conversationId),
            );

            const newThreadIds = Array.from(batchThreadIds).filter(
              (threadId) => !publishedThreadIds.has(threadId),
            );

            const promises: Promise<unknown>[] = [];

            if (movedMessageIds.length > 0) {
              movedMessagesCount += movedMessageIds.length;
              promises.push(
                updateEmailMessagesForSender({
                  sender,
                  messageIds: movedMessageIds,
                  emailAccountId,
                  action,
                }),
              );
            }

            if (newThreadIds.length > 0) {
              promises.push(
                publishBulkActionToTinybird({
                  threadIds: newThreadIds,
                  action,
                  ownerEmail,
                }),
              );
            }

            await Promise.all(promises);

            newThreadIds.forEach((threadId) =>
              publishedThreadIds.add(threadId),
            );

            if (hasErrors && !continueOnError) {
              throw new Error(
                "Graph batch returned one or more error responses.",
              );
            }
          } catch (error) {
            logger.error("Failed to move or track messages", {
              action,
              sender,
              ownerEmail,
              destinationId,
              messageIds,
              error,
            });
            if (!continueOnError) throw error;
          } finally {
            messageIds.forEach((id) => processedMessageIds.add(id));
          }
        }

        nextLink = response["@odata.nextLink"];
        logger.info("Pagination status", {
          processedCount: processedMessageIds.size,
          hasNextLink: !!nextLink,
        });
      } catch (error) {
        logger.error("Failed to fetch messages from sender", {
          sender,
          action,
          error,
        });
        if (!continueOnError) throw error;
        nextLink = undefined;
      }
    } while (nextLink);
  }

  return movedMessagesCount;
}
