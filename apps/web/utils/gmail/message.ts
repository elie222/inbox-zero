import type { gmail_v1 } from "@googleapis/gmail";
import {
  type BatchError,
  type MessageWithPayload,
  type ParsedMessage,
  type ThreadWithPayloadMessages,
  isBatchError,
  isDefined,
} from "@/utils/types";
import { getBatch } from "@/utils/gmail/batch";
import { getSearchTermForSender } from "@/utils/email";
import { createScopedLogger } from "@/utils/logger";
import { sleep } from "@/utils/sleep";
import { getAccessTokenFromClient } from "@/utils/gmail/client";
import { GmailLabel } from "@/utils/gmail/label";
import { isIgnoredSender } from "@/utils/filter-ignored-senders";
import parse from "gmail-api-parse-message";
import { withGmailRetry } from "@/utils/gmail/retry";

const logger = createScopedLogger("gmail/message");

export function parseMessage(
  message: MessageWithPayload,
): ParsedMessage & { subject: string; date: string } {
  const parsed = parse(message) as ParsedMessage;
  return {
    ...parsed,
    subject: parsed.headers?.subject || "",
    date: parsed.headers?.date || "",
  };
}

export function parseMessages(
  thread: ThreadWithPayloadMessages,
  {
    withoutIgnoredSenders,
    withoutDrafts,
  }: {
    withoutIgnoredSenders?: boolean;
    withoutDrafts?: boolean;
  } = {},
) {
  const messages =
    thread.messages?.map((message: MessageWithPayload) => {
      return parseMessage(message);
    }) || [];

  if (withoutIgnoredSenders || withoutDrafts) {
    const filteredMessages = messages.filter((message) => {
      if (
        withoutIgnoredSenders &&
        message.headers &&
        isIgnoredSender(message.headers.from)
      )
        return false;
      if (withoutDrafts && message.labelIds?.includes(GmailLabel.DRAFT))
        return false;
      return true;
    });
    return filteredMessages;
  }

  return messages;
}

export async function getMessage(
  messageId: string,
  gmail: gmail_v1.Gmail,
  format?: "full" | "metadata",
): Promise<MessageWithPayload> {
  return withGmailRetry(async () => {
    const message = await gmail.users.messages.get({
      userId: "me",
      id: messageId,
      format,
    });

    return message.data as MessageWithPayload;
  });
}

export async function getMessageByRfc822Id(
  rfc822MessageId: string,
  gmail: gmail_v1.Gmail,
) {
  // Search for message using RFC822 Message-ID header
  // Remove any < > brackets if present
  const cleanMessageId = rfc822MessageId.replace(/[<>]/g, "");

  const response = await withGmailRetry(() =>
    gmail.users.messages.list({
      userId: "me",
      q: `rfc822msgid:${cleanMessageId}`,
      maxResults: 1,
    }),
  );

  const message = response.data.messages?.[0];
  if (!message?.id) {
    logger.error("No message found for RFC822 Message-ID", {
      rfc822MessageId,
    });
    return null;
  }

  return getMessage(message.id, gmail);
}

export async function getMessagesBatch({
  messageIds,
  accessToken,
  retryCount = 0,
}: {
  messageIds: string[];
  accessToken: string;
  retryCount?: number;
}): Promise<ParsedMessage[]> {
  if (!accessToken) throw new Error("No access token");

  if (retryCount > 3) {
    logger.error("Too many retries", { messageIds, retryCount });
    return [];
  }
  if (messageIds.length > 100) throw new Error("Too many messages. Max 100");

  const batch: (MessageWithPayload | BatchError)[] = await getBatch(
    messageIds,
    "/gmail/v1/users/me/messages",
    accessToken,
  );

  const missingMessageIds = new Set<string>();

  if (batch.some((m) => isBatchError(m) && m.error.code === 401)) {
    logger.error("Error fetching messages", { firstBatchItem: batch?.[0] });
    throw new Error("Invalid access token");
  }

  const messages = batch
    .map((message, i) => {
      if (isBatchError(message)) {
        logger.error("Error fetching message", {
          code: message.error.code,
          error: message.error.message,
        });
        missingMessageIds.add(messageIds[i]);
        return;
      }

      return parseMessage(message as MessageWithPayload);
    })
    .filter(isDefined);

  // if we errored, then try to refetch the missing messages
  if (missingMessageIds.size > 0) {
    logger.info("Missing messages", {
      missingMessageIds: Array.from(missingMessageIds),
    });
    const nextRetryCount = retryCount + 1;
    await sleep(1000 * nextRetryCount);
    const missingMessages = await getMessagesBatch({
      messageIds: Array.from(missingMessageIds),
      accessToken,
      retryCount: nextRetryCount,
    });
    return [...messages, ...missingMessages];
  }

  return messages;
}

async function findPreviousEmailsWithSender(
  gmail: gmail_v1.Gmail,
  options: {
    sender: string;
    dateInSeconds: number;
  },
) {
  const beforeTimestamp = Math.floor(options.dateInSeconds);
  const query = `(from:${options.sender} OR to:${options.sender}) before:${beforeTimestamp}`;

  const response = await getMessages(gmail, {
    query,
    maxResults: 4,
  });

  return response.messages || [];
}

async function hasPreviousCommunicationWithSender(
  gmail: gmail_v1.Gmail,
  options: { from: string; date: Date; messageId: string },
) {
  const previousEmails = await findPreviousEmailsWithSender(gmail, {
    sender: options.from,
    dateInSeconds: +new Date(options.date) / 1000,
  });
  // Ignore the current email
  const hasPreviousEmail = !!previousEmails?.find(
    (p) => p.id !== options.messageId,
  );

  return hasPreviousEmail;
}

export async function hasPreviousCommunicationsWithSenderOrDomain(
  gmail: gmail_v1.Gmail,
  options: { from: string; date: Date; messageId: string },
) {
  const searchTerm = getSearchTermForSender(options.from);

  return hasPreviousCommunicationWithSender(gmail, {
    ...options,
    from: searchTerm,
  });
}

// List of messages.
// Note that each message resource contains only an id and a threadId.
// Additional message details can be fetched using the messages.get method.
// https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages/list
export async function getMessages(
  gmail: gmail_v1.Gmail,
  options: {
    query?: string;
    maxResults?: number;
    pageToken?: string;
    labelIds?: string[];
  },
): Promise<{
  messages: {
    id: string;
    threadId: string;
  }[];
  nextPageToken?: string;
}> {
  const messages = await withGmailRetry(() =>
    gmail.users.messages.list({
      userId: "me",
      maxResults: options.maxResults,
      q: options.query,
      pageToken: options.pageToken,
      labelIds: options.labelIds,
    }),
  );

  return {
    messages: messages.data.messages?.filter(isMessage) || [],
    nextPageToken: messages.data.nextPageToken || undefined,
  };
}

function isMessage(
  message: gmail_v1.Schema$Message,
): message is { id: string; threadId: string } {
  return !!message.id && !!message.threadId;
}

export async function queryBatchMessages(
  gmail: gmail_v1.Gmail,
  options: {
    query?: string;
    maxResults?: number;
    pageToken?: string;
  },
) {
  const { query, pageToken } = options;

  const MAX_RESULTS = 20;

  const maxResults = Math.min(options.maxResults || MAX_RESULTS, MAX_RESULTS);

  if (options.maxResults && options.maxResults > MAX_RESULTS) {
    logger.warn(
      "Max results is greater than 20, which will cause rate limiting",
      {
        maxResults,
      },
    );
  }

  const accessToken = getAccessTokenFromClient(gmail);

  const messages = await getMessages(gmail, { query, maxResults, pageToken });
  if (!messages.messages) return { messages: [], nextPageToken: undefined };
  const messageIds = messages.messages.map((m) => m.id).filter(isDefined);
  return {
    messages: (await getMessagesBatch({ messageIds, accessToken })) || [],
    nextPageToken: messages.nextPageToken,
  };
}

// loops through multiple pages of messages
export async function queryBatchMessagesPages(
  gmail: gmail_v1.Gmail,
  {
    query,
    maxResults,
  }: {
    query: string;
    maxResults: number;
  },
) {
  const messages: ParsedMessage[] = [];
  let nextPageToken: string | undefined;
  do {
    const { messages: pageMessages, nextPageToken: nextToken } =
      await queryBatchMessages(gmail, {
        query,
        pageToken: nextPageToken,
      });
    messages.push(...pageMessages);
    nextPageToken = nextToken || undefined;
  } while (nextPageToken && messages.length < maxResults);

  return messages;
}

export async function getSentMessages(gmail: gmail_v1.Gmail, maxResults = 20) {
  const messages = await queryBatchMessages(gmail, {
    query: "label:sent",
    maxResults,
  });
  return messages.messages;
}
