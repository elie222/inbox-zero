import type { Client } from "@microsoft/microsoft-graph-client";
import type { Message } from "@microsoft/microsoft-graph-types";
import type { ParsedMessage } from "@/utils/types";
import { createScopedLogger } from "@/utils/logger";
import type { OutlookClient } from "@/utils/outlook/client";

const logger = createScopedLogger("outlook/message");

// Outlook equivalent of Gmail labels
const OutlookLabel = {
  DRAFT: "draft",
  SENT: "sent",
  INBOX: "inbox",
} as const;

function getOutlookLabels(message: Message): string[] {
  const labels: string[] = [];

  if (message.isDraft) {
    labels.push(OutlookLabel.DRAFT);
  }

  // Check if message is in sent items
  if (
    message.from?.emailAddress?.address ===
    message.sender?.emailAddress?.address
  ) {
    labels.push(OutlookLabel.SENT);
  }

  // Check if message is in inbox
  // In Outlook, messages in inbox have no specific property, but we can infer it
  // from the fact that it's not in sent items and not a draft
  if (!message.isDraft && !labels.includes(OutlookLabel.SENT)) {
    labels.push(OutlookLabel.INBOX);
  }

  return labels;
}

export async function queryBatchMessages(
  client: OutlookClient,
  {
    query,
    maxResults = 20,
    pageToken,
  }: {
    query?: string;
    maxResults?: number;
    pageToken?: string;
  },
) {
  if (maxResults > 20) {
    throw new Error(
      "Max results must be 20 or Microsoft Graph API will rate limit us.",
    );
  }

  // Build the request
  let request = client
    .getClient()
    .api("/me/messages")
    .select(
      "id,conversationId,subject,bodyPreview,from,sender,toRecipients,receivedDateTime,isDraft,body",
    )
    .top(maxResults)
    .orderby("receivedDateTime DESC");

  // Add search query if present
  if (query?.trim()) {
    const escapedQuery = query.trim().replace(/'/g, "''");
    request = request.filter(
      `(contains(subject,'${escapedQuery}') or contains(bodyPreview,'${escapedQuery}'))`,
    );
  }

  // Handle pagination
  if (pageToken) {
    request = request.skipToken(pageToken);
  }

  const response = await request.get();

  // Convert Outlook messages to ParsedMessage format
  const messages: ParsedMessage[] = response.value.map((message: Message) => ({
    id: message.id || "",
    threadId: message.conversationId || "",
    snippet: message.bodyPreview || "",
    textPlain: message.body?.content || "",
    textHtml: message.body?.content || "",
    headers: {
      from: message.from?.emailAddress?.address || "",
      to: message.toRecipients?.[0]?.emailAddress?.address || "",
      subject: message.subject || "",
      date: message.receivedDateTime || new Date().toISOString(),
    },
    labelIds: getOutlookLabels(message),
    internalDate: message.receivedDateTime || new Date().toISOString(),
    historyId: "",
    inline: [],
  }));

  return {
    messages,
    nextPageToken: response["@odata.nextLink"]
      ? new URL(response["@odata.nextLink"]).searchParams.get("$skiptoken")
      : undefined,
  };
}

export async function getMessage(
  messageId: string,
  client: OutlookClient,
): Promise<ParsedMessage> {
  const message = await client
    .getClient()
    .api(`/me/messages/${messageId}`)
    .select(
      "id,conversationId,subject,bodyPreview,from,sender,toRecipients,receivedDateTime,isDraft,body",
    )
    .get();

  return {
    id: message.id || "",
    threadId: message.conversationId || "",
    snippet: message.bodyPreview || "",
    textPlain: message.body?.content || "",
    textHtml: message.body?.content || "",
    headers: {
      from: message.from?.emailAddress?.address || "",
      to: message.toRecipients?.[0]?.emailAddress?.address || "",
      subject: message.subject || "",
      date: message.receivedDateTime || new Date().toISOString(),
    },
    labelIds: getOutlookLabels(message),
    internalDate: message.receivedDateTime || new Date().toISOString(),
    historyId: "",
    inline: [],
  };
}

export async function getMessages(
  client: OutlookClient,
  options: {
    query?: string;
    maxResults?: number;
    pageToken?: string;
  },
) {
  const top = options.maxResults || 20;
  let request = client
    .getClient()
    .api("/me/messages")
    .top(top)
    .select(
      "id,conversationId,subject,bodyPreview,body,from,toRecipients,receivedDateTime",
    );

  if (options.query) {
    request = request.filter(`contains(subject, '${options.query}')`);
  }

  const response = await request.get();

  return {
    messages: response.value,
    nextPageToken: response["@odata.nextLink"],
  };
}

function parseOutlookMessage(message: Message): ParsedMessage {
  return {
    id: message.id || "",
    threadId: message.conversationId || "",
    snippet: message.bodyPreview || "",
    textPlain: message.body?.content || "",
    headers: {
      from: message.from?.emailAddress?.address || "",
      to: message.toRecipients?.[0]?.emailAddress?.address || "",
      subject: message.subject || "",
      date: message.receivedDateTime || new Date().toISOString(),
    },
    historyId: "",
    inline: [],
    internalDate: message.receivedDateTime || new Date().toISOString(),
  };
}
