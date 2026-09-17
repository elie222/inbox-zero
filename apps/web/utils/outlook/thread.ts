import {
  ResponseType,
  type GraphRequest,
} from "@microsoft/microsoft-graph-client";
import type { GetThreadOptions } from "@/utils/email/types";
import {
  COMPLETE_THREAD_MESSAGE_LIMIT,
  createCompleteThreadBudget,
  readCompleteThreadJson,
} from "@/utils/email/complete-thread";
import type { OutlookClient } from "@/utils/outlook/client";
import type { Message, Attachment } from "@microsoft/microsoft-graph-types";
import type { ParsedMessage } from "@/utils/types";
import { escapeODataString } from "@/utils/outlook/odata-escape";
import type { Logger } from "@/utils/logger";
import {
  MESSAGE_SELECT_FIELDS,
  MESSAGE_EXPAND_ATTACHMENTS,
  convertMessage,
  createMessagesRequest,
  getCategoryMap,
  getFolderIds,
} from "@/utils/outlook/message";
import {
  extractErrorInfo,
  isRetryableError,
  withMicrosoftGraphRetry,
} from "@/utils/microsoft/retry";
import { resolveMicrosoftGraphNextLink } from "@/utils/outlook/page-token";

export async function getThread(
  threadId: string,
  client: OutlookClient,
  logger: Logger,
  options?: GetThreadOptions,
): Promise<Message[]> {
  const escapedThreadId = escapeODataString(threadId);
  const filter = `conversationId eq '${escapedThreadId}'`;

  try {
    const request = createMessagesRequest(client).filter(filter).top(100);
    const messages = options?.complete
      ? {
          value: await getCompleteThreadMessages(
            request,
            threadId,
            client,
            logger,
            options.signal,
          ),
        }
      : await withMicrosoftGraphRetry(async () => {
          options?.signal?.throwIfAborted();
          return (
            options?.signal
              ? request.options({ signal: options.signal })
              : request
          ).get() as Promise<{ value: Message[] }>;
        }, logger);

    // Sort in memory to avoid "restriction or sort order is too complex" error
    return messages.value.sort((a, b) => {
      const dateA =
        a.isDraft && !a.receivedDateTime
          ? Number.POSITIVE_INFINITY
          : new Date(a.receivedDateTime || 0).getTime();
      const dateB =
        b.isDraft && !b.receivedDateTime
          ? Number.POSITIVE_INFINITY
          : new Date(b.receivedDateTime || 0).getTime();
      return dateA - dateB;
    });
  } catch (error) {
    // biome-ignore lint/suspicious/noExplicitAny: existing loose external shape
    const err = error as any;

    const context = {
      threadId,
      filter,
      error: error instanceof Error ? error.message : err,
      errorCode: err?.code,
      errorStatusCode: err?.statusCode,
    };
    if (isRetryableError(extractErrorInfo(error)).isRateLimit) {
      logger.warn("getThread failed", context);
    } else {
      logger.error("getThread failed", context);
    }
    throw error;
  }
}

export async function getThreads(
  query: string,
  client: OutlookClient,
  logger: Logger,
  maxResults = 100,
): Promise<{
  nextPageToken?: string | null;
  threads: { id: string; snippet: string }[];
}> {
  let request = client.getClient().api("/me/messages");

  if (query) {
    request = request.filter(
      `contains(subject, '${escapeODataString(query)}')`,
    );
  }

  const response: { value: Message[]; "@odata.nextLink"?: string } =
    await withMicrosoftGraphRetry(
      () =>
        request
          .top(maxResults)
          .select("id,conversationId,subject,bodyPreview")
          .get(),
      logger,
    );

  // Group messages by conversationId to create thread-like structure
  const threadMap = new Map<string, { id: string; snippet: string }>();
  for (const message of response.value) {
    if (message.conversationId && !threadMap.has(message.conversationId)) {
      threadMap.set(message.conversationId, {
        id: message.conversationId,
        snippet: message.bodyPreview || "",
      });
    }
  }

  return {
    threads: Array.from(threadMap.values()),
    nextPageToken: response["@odata.nextLink"],
  };
}

export async function getThreadsWithNextPageToken({
  client,
  query,
  maxResults = 100,
  pageToken,
  logger,
}: {
  client: OutlookClient;
  query?: string;
  maxResults?: number;
  pageToken?: string;
  logger: Logger;
}) {
  const endpoint = resolveMicrosoftGraphNextLink(pageToken) || "/me/messages";

  let request = client
    .getClient()
    .api(endpoint)
    .top(maxResults)
    .select("id,conversationId,subject,bodyPreview");

  if (query) {
    request = request.filter(
      `contains(subject, '${escapeODataString(query)}')`,
    );
  }

  const response: { value: Message[]; "@odata.nextLink"?: string } =
    await withMicrosoftGraphRetry(() => request.get(), logger);

  // Group messages by conversationId to create thread-like structure
  const threadMap = new Map<string, { id: string; snippet: string }>();
  for (const message of response.value) {
    if (message.conversationId && !threadMap.has(message.conversationId)) {
      threadMap.set(message.conversationId, {
        id: message.conversationId,
        snippet: message.bodyPreview || "",
      });
    }
  }

  return {
    threads: Array.from(threadMap.values()),
    nextPageToken: response["@odata.nextLink"],
  };
}

export async function getThreadsFromSender(
  client: OutlookClient,
  sender: string,
  limit: number,
  logger: Logger,
): Promise<Array<{ id: string; snippet: string }>> {
  const response: { value: Message[] } = await withMicrosoftGraphRetry(
    () =>
      client
        .getClient()
        .api("/me/messages")
        .filter(`from/emailAddress/address eq '${escapeODataString(sender)}'`)
        .top(limit)
        .select("id,conversationId,bodyPreview")
        .get(),
    logger,
  );

  // Group messages by conversationId
  const threadMap = new Map<string, { id: string; snippet: string }>();
  for (const message of response.value) {
    if (message.conversationId && !threadMap.has(message.conversationId)) {
      threadMap.set(message.conversationId, {
        id: message.conversationId,
        snippet: message.bodyPreview || "",
      });
    }
  }

  return Array.from(threadMap.values());
}

export async function getThreadsFromSenderWithSubject(
  client: OutlookClient,
  sender: string,
  limit: number,
  logger: Logger,
): Promise<Array<{ id: string; snippet: string; subject: string }>> {
  const response: { value: Message[] } = await withMicrosoftGraphRetry(
    () =>
      client
        .getClient()
        .api("/me/messages")
        .filter(`from/emailAddress/address eq '${escapeODataString(sender)}'`)
        .top(limit)
        .select("id,conversationId,subject,bodyPreview")
        .get(),
    logger,
  );

  // Group messages by conversationId
  const threadMap = new Map<
    string,
    { id: string; snippet: string; subject: string }
  >();
  for (const message of response.value) {
    if (message.conversationId && !threadMap.has(message.conversationId)) {
      threadMap.set(message.conversationId, {
        id: message.conversationId,
        snippet: message.bodyPreview || "",
        subject: message.subject || "",
      });
    }
  }

  return Array.from(threadMap.values());
}

export async function getThreadMessages(
  threadId: string,
  client: OutlookClient,
  logger: Logger,
  { includeDrafts = false, ...options }: GetThreadOptions = {},
): Promise<ParsedMessage[]> {
  options.signal?.throwIfAborted();
  const [messages, folderIds, categoryMap] = await Promise.all([
    getThread(threadId, client, logger, options),
    getFolderIds(client, logger, {
      includeDrafts,
      ...(options.signal ? { signal: options.signal } : {}),
    }),
    getCategoryMap(client, logger, options.signal),
  ]);

  options.signal?.throwIfAborted();
  return messages
    .filter((msg) => includeDrafts || !msg.isDraft)
    .map((msg) => convertMessage(msg, folderIds, categoryMap));
}

async function getCompleteThreadMessages(
  request: GraphRequest,
  threadId: string,
  client: OutlookClient,
  logger: Logger,
  signal?: AbortSignal,
) {
  const budget = createCompleteThreadBudget();
  const seen = new Set<string>();
  const messages: Message[] = [];
  const ids = new Set<string>();
  let current: GraphRequest | undefined = request;
  while (current) {
    const page = await readCompleteGraphPage<Message>(
      current,
      budget,
      logger,
      signal,
    );
    for (const message of page.value) {
      if (
        !message.id ||
        message.conversationId !== threadId ||
        ids.has(message.id)
      )
        throw new Error("Inconsistent conversation snapshot");
      ids.add(message.id);
      messages.push(message);
      if (messages.length > COMPLETE_THREAD_MESSAGE_LIMIT)
        throw new Error(
          "Conversation exceeds the offline snapshot message limit",
        );
    }
    const next = completeNextLink(
      page["@odata.nextLink"],
      "/me/messages",
      seen,
    );
    current = next
      ? client
          .getClient()
          .api(next)
          .select(MESSAGE_SELECT_FIELDS)
          .expand(MESSAGE_EXPAND_ATTACHMENTS)
      : undefined;
  }
  for (const message of messages) {
    const path = `/me/messages/${encodeURIComponent(message.id!)}/attachments`;
    const attachmentSeen = new Set<string>();
    const embeddedNext = (
      message as Message & { "attachments@odata.nextLink"?: string }
    )["attachments@odata.nextLink"];
    const next = completeNextLink(embeddedNext, path, attachmentSeen);
    const fields =
      "id,name,contentType,size,isInline,microsoft.graph.fileAttachment/contentId";
    let attachments = message.attachments ?? [];
    let attachmentRequest: GraphRequest | undefined;
    if (next) attachmentRequest = client.getClient().api(next).select(fields);
    else if (!Array.isArray(message.attachments))
      attachmentRequest = client.getClient().api(path).select(fields).top(100);
    while (attachmentRequest) {
      const page = await readCompleteGraphPage<Attachment>(
        attachmentRequest,
        budget,
        logger,
        signal,
      );
      attachments = attachments.concat(page.value);
      const next = completeNextLink(
        page["@odata.nextLink"],
        path,
        attachmentSeen,
      );
      attachmentRequest = next
        ? client.getClient().api(next).select(fields)
        : undefined;
    }
    if (
      attachments.some((attachment) => !attachment.id) ||
      new Set(attachments.map((attachment) => attachment.id)).size !==
        attachments.length
    )
      throw new Error("Inconsistent attachment snapshot");
    message.attachments = attachments;
  }
  return messages;
}

async function readCompleteGraphPage<T>(
  request: GraphRequest,
  budget: ReturnType<typeof createCompleteThreadBudget>,
  logger: Logger,
  signal?: AbortSignal,
) {
  if (budget.remainingPages <= 0)
    throw new Error("Conversation exceeds the offline snapshot page limit");
  const response: Response = await withMicrosoftGraphRetry(async () => {
    signal?.throwIfAborted();
    const result: Response = await request
      .options({ signal })
      .responseType(ResponseType.RAW)
      .get();
    if (!result.ok) {
      await result.body?.cancel().catch(() => undefined);
      throw Object.assign(new Error("Unable to read complete conversation"), {
        statusCode: result.status,
      });
    }
    return result;
  }, logger);
  if (!response.body) throw new Error("Missing conversation response");
  const page = await readCompleteThreadJson<{
    value: T[];
    "@odata.nextLink"?: string;
  }>(response.body, budget, signal);
  if (!page || !Array.isArray(page.value))
    throw new Error("Invalid conversation response");
  return page;
}

function completeNextLink(value: unknown, path: string, seen: Set<string>) {
  if (value === undefined || value === null) return;
  if (typeof value !== "string" || !value)
    throw new Error("Invalid conversation continuation");
  const next = resolveMicrosoftGraphNextLink(value);
  if (!next) throw new Error("Invalid conversation continuation");
  const url = new URL(next);
  if (
    url.username ||
    url.password ||
    url.hash ||
    decodeURIComponent(url.pathname) !== `/v1.0${decodeURIComponent(path)}` ||
    seen.has(url.href)
  )
    throw new Error("Invalid or repeated conversation continuation");
  seen.add(url.href);
  return next;
}
