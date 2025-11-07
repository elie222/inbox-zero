import { createScopedLogger } from "@/utils/logger";
import type { OutlookClient } from "@/utils/outlook/client";

const logger = createScopedLogger("outlook/batch");

export const GRAPH_JSON_BATCH_LIMIT = 20; // Microsoft Graph JSON batching limit

export type GraphBatchRequestItem<TBody = unknown> = {
  id: string;
  method: string;
  url: string;
  headers?: Record<string, string>;
  body?: TBody;
};

export type GraphBatchRequest<TBody = unknown> = {
  requests: GraphBatchRequestItem<TBody>[];
};

export type GraphBatchResponseItem<TBody = unknown> = {
  id: string;
  status: number;
  headers?: Record<string, string>;
  body?: TBody | null;
};

export type GraphBatchResponse<TBody = unknown> = {
  responses?: GraphBatchResponseItem<TBody>[];
};

export async function batch<
  TRequestBody = unknown,
  TResponseBody = unknown,
>(options: {
  client: OutlookClient;
  requests: GraphBatchRequestItem<TRequestBody>[];
  stopOnError?: boolean;
  onFailure?: (params: {
    request?: GraphBatchRequestItem<TRequestBody>;
    response: GraphBatchResponseItem<TResponseBody>;
  }) => void;
  context?: Record<string, unknown>;
}): Promise<GraphBatchResponseItem<TResponseBody>[]> {
  const { client, requests, stopOnError = false, onFailure, context } = options;

  if (requests.length === 0) {
    return [];
  }

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

      if (stopOnError) {
        const errors = responses.filter((res) => res.status >= 400);
        if (errors.length > 0) {
          logger.error("Graph batch responses contain errors", {
            ...context,
            errorCount: errors.length,
            statuses: errors.map((res) => res.status),
          });
          throw new Error("Graph batch returned one or more error responses.");
        }
      }
    } catch (error) {
      logger.error("Graph batch request failed", {
        ...context,
        chunkSize: chunk.length,
        error: error instanceof Error ? error.message : error,
      });
      throw error;
    }
  }

  return aggregatedResponses;
}

export type MoveMessagesInBatchesOptions = {
  client: OutlookClient;
  messageIds: string[];
  destinationId: string;
  action: "archive" | "trash";
};

export async function moveMessagesInBatches(
  options: MoveMessagesInBatchesOptions,
): Promise<void> {
  const { client, messageIds, destinationId, action } = options;

  if (messageIds.length === 0) {
    return;
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

  await batch<{ destinationId: string }, { error?: { message?: string } }>({
    client,
    requests,
    stopOnError: true,
    context: {
      action,
      destinationId,
      messageCount: messageIds.length,
    },
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
}
