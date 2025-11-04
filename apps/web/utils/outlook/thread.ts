import type { OutlookClient } from "@/utils/outlook/client";
import type { Message } from "@microsoft/microsoft-graph-types";
import type { ParsedMessage } from "@/utils/types";
import { escapeODataString } from "@/utils/outlook/odata-escape";
import { createScopedLogger } from "@/utils/logger";
import { convertMessage, getFolderIds } from "@/utils/outlook/message";

const logger = createScopedLogger("outlook/thread");

export async function getThread(
  threadId: string,
  client: OutlookClient,
): Promise<Message[]> {
  const escapedThreadId = escapeODataString(threadId);
  const filter = `conversationId eq '${escapedThreadId}'`;

  try {
    const messages: { value: Message[] } = await client
      .getClient()
      .api("/me/messages")
      .filter(filter)
      .select(
        "id,conversationId,conversationIndex,subject,bodyPreview,from,sender,toRecipients,receivedDateTime,isDraft,isRead,body,categories,parentFolderId",
      )
      .top(100) // Get up to 100 messages instead of default 10
      .get();

    // Sort in memory to avoid "restriction or sort order is too complex" error
    return messages.value.sort((a, b) => {
      const dateA = new Date(a.receivedDateTime || 0).getTime();
      const dateB = new Date(b.receivedDateTime || 0).getTime();
      return dateB - dateA; // desc order (newest first)
    });
  } catch (error) {
    const err = error as any;

    logger.error("getThread failed", {
      threadId,
      filter,
      error: error instanceof Error ? error.message : err,
      errorCode: err?.code,
      errorStatusCode: err?.statusCode,
    });
    throw error;
  }
}

export async function getThreads(
  query: string,
  client: OutlookClient,
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
    await request
      .top(maxResults)
      .select("id,conversationId,subject,bodyPreview")
      .get();

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
}: {
  client: OutlookClient;
  query?: string;
  maxResults?: number;
  pageToken?: string;
}) {
  let request = client
    .getClient()
    .api(pageToken || "/me/messages")
    .top(maxResults)
    .select("id,conversationId,subject,bodyPreview");

  if (query) {
    request = request.filter(
      `contains(subject, '${escapeODataString(query)}')`,
    );
  }

  const response: { value: Message[]; "@odata.nextLink"?: string } =
    await request.get();

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
): Promise<Array<{ id: string; snippet: string }>> {
  const response: { value: Message[] } = await client
    .getClient()
    .api("/me/messages")
    .filter(`from/emailAddress/address eq '${escapeODataString(sender)}'`)
    .top(limit)
    .select("id,conversationId,bodyPreview")
    .get();

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
): Promise<Array<{ id: string; snippet: string; subject: string }>> {
  const response: { value: Message[] } = await client
    .getClient()
    .api("/me/messages")
    .filter(`from/emailAddress/address eq '${escapeODataString(sender)}'`)
    .top(limit)
    .select("id,conversationId,subject,bodyPreview")
    .get();

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
): Promise<ParsedMessage[]> {
  const messages: Message[] = await getThread(threadId, client);
  const folderIds = await getFolderIds(client);

  return messages
    .filter((msg) => !msg.isDraft)
    .map((msg) => convertMessage(msg, folderIds));
}
