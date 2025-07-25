import type { OutlookClient } from "@/utils/outlook/client";
import type { Message } from "@microsoft/microsoft-graph-types";
import type { ParsedMessage } from "@/utils/types";
import { createScopedLogger } from "@/utils/logger";

const logger = createScopedLogger("outlook/thread");

export async function getThread(
  threadId: string,
  client: OutlookClient,
): Promise<Message[]> {
  const messages = await client
    .getClient()
    .api("/me/messages")
    .filter(`conversationId eq '${threadId}'`)
    .orderby("receivedDateTime desc")
    .get();

  return messages.value;
}

export async function getThreads(
  query: string,
  client: OutlookClient,
  maxResults = 100,
): Promise<{
  nextPageToken?: string | null;
  threads: { id: string; snippet: string }[];
}> {
  const response = await client
    .getClient()
    .api("/me/messages")
    .filter(query ? `contains(subject, '${query}')` : "")
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
    request = request.filter(`contains(subject, '${query}')`);
  }

  const response = await request.get();

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
  const response = await client
    .getClient()
    .api("/me/messages")
    .filter(`from/emailAddress/address eq '${sender}'`)
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
  const response = await client
    .getClient()
    .api("/me/messages")
    .filter(`from/emailAddress/address eq '${sender}'`)
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
  const messages = await getThread(threadId, client);

  return messages.map((msg) => ({
    id: msg.id || "",
    threadId: msg.conversationId || "",
    snippet: msg.bodyPreview || "",
    textPlain: msg.body?.content || "",
    headers: {
      from: msg.from?.emailAddress?.address || "",
      to: msg.toRecipients?.[0]?.emailAddress?.address || "",
      subject: msg.subject || "",
      date: msg.receivedDateTime || new Date().toISOString(),
    },
    historyId: "",
    inline: [],
    internalDate: msg.receivedDateTime || new Date().toISOString(),
    subject: msg.subject || "",
    date: msg.receivedDateTime || new Date().toISOString(),
    conversationIndex: msg.conversationIndex,
    metadata: {
      provider: "microsoft-entra-id",
    },
  }));
}
