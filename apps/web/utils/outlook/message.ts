import type { Client } from "@microsoft/microsoft-graph-client";
import type { Message } from "@microsoft/microsoft-graph-types";
import type { ParsedMessage } from "@/utils/types";
import { createScopedLogger } from "@/utils/logger";
import type { OutlookClient } from "@/utils/outlook/client";
import { OutlookLabel } from "./label";

const logger = createScopedLogger("outlook/message");

// Cache for folder IDs
let folderIdCache: Record<string, string> | null = null;

// Well-known folder names in Outlook that are consistent across all languages
const WELL_KNOWN_FOLDERS = {
  inbox: "inbox",
  sentitems: "sentitems",
  drafts: "drafts",
  archive: "archive",
  deleteditems: "deleteditems",
  junkemail: "junkemail",
} as const;

async function getFolderIds(client: OutlookClient) {
  if (folderIdCache) return folderIdCache;

  // First get the well-known folders
  const wellKnownFolders = await Promise.all(
    Object.entries(WELL_KNOWN_FOLDERS).map(async ([key, folderName]) => {
      try {
        const response = await client
          .getClient()
          .api(`/me/mailFolders/${folderName}`)
          .select("id")
          .get();
        return [key, response.id];
      } catch (error) {
        logger.warn(`Failed to get well-known folder: ${folderName}`, {
          error,
        });
        return [key, null];
      }
    }),
  );

  folderIdCache = wellKnownFolders.reduce(
    (acc, [key, id]) => {
      if (id) acc[key] = id;
      return acc;
    },
    {} as Record<string, string>,
  );

  logger.info("Fetched Outlook folder IDs", { folders: folderIdCache });
  return folderIdCache;
}

function getOutlookLabels(
  message: Message,
  folderIds: Record<string, string>,
): string[] {
  const labels: string[] = [];

  logger.info("Processing message labels", {
    messageId: message.id,
    parentFolderId: message.parentFolderId,
    folderName: message.parentFolderId
      ? Object.entries(folderIds).find(
          ([_, id]) => id === message.parentFolderId,
        )?.[0]
      : undefined,
    isDraft: message.isDraft,
    categories: message.categories,
  });

  // Check if message is a draft
  if (message.isDraft) {
    labels.push(OutlookLabel.DRAFT);
  }

  // Map folder ID to label
  if (message.parentFolderId) {
    const folderKey = Object.entries(folderIds).find(
      ([_, id]) => id === message.parentFolderId,
    )?.[0];
    if (folderKey === "inbox") {
      labels.push(OutlookLabel.INBOX);
    } else if (folderKey === "sentitems") {
      labels.push(OutlookLabel.SENT);
    } else if (folderKey === "drafts") {
      labels.push(OutlookLabel.DRAFT);
    } else if (folderKey === "junkemail") {
      labels.push(OutlookLabel.SPAM);
    } else if (folderKey === "deleteditems") {
      labels.push(OutlookLabel.TRASH);
    }
  }

  // Add category labels
  if (message.categories) {
    labels.push(...message.categories);
  }

  logger.info("Final labels for message", {
    messageId: message.id,
    labels,
  });

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

  // Get folder IDs first
  const folderIds = await getFolderIds(client);

  logger.info("Building Outlook request", {
    maxResults,
    hasQuery: !!query,
    pageToken,
  });

  // Build the base request
  let request = client
    .getClient()
    .api("/me/messages")
    .select(
      "id,conversationId,subject,bodyPreview,from,sender,toRecipients,receivedDateTime,isDraft,body,categories,parentFolderId",
    )
    .top(maxResults);

  let nextPageToken: string | undefined;

  if (query?.trim()) {
    // Search path - use search and skipToken
    request = request.search(query.trim());

    if (pageToken) {
      request = request.skipToken(pageToken);
    }

    const response = await request.get();
    const messages = await convertMessages(response.value, folderIds);

    // For search, get next page token from @odata.nextLink
    nextPageToken = response["@odata.nextLink"]
      ? new URL(response["@odata.nextLink"]).searchParams.get("$skiptoken") ||
        undefined
      : undefined;

    logger.info("Search results", {
      messageCount: messages.length,
      hasNextPageToken: !!nextPageToken,
    });

    return { messages, nextPageToken };
  } else {
    // Non-search path - use skip and orderBy
    const skip = pageToken ? parseInt(pageToken, 10) : 0;
    request = request.skip(skip).orderby("receivedDateTime DESC");

    const response = await request.get();
    const messages = await convertMessages(response.value, folderIds);

    // For non-search, calculate next page token based on message count
    const hasMore = messages.length === maxResults;
    nextPageToken = hasMore ? (skip + maxResults).toString() : undefined;

    logger.info("Non-search results", {
      messageCount: messages.length,
      skip,
      hasMore,
      nextPageToken,
    });

    return { messages, nextPageToken };
  }
}

// Helper function to convert messages
async function convertMessages(
  messages: Message[],
  folderIds: Record<string, string>,
): Promise<ParsedMessage[]> {
  return messages.map((message: Message) => {
    const labelIds = getOutlookLabels(message, folderIds);

    logger.info("Converting message to ParsedMessage", {
      messageId: message.id,
      labelIds,
    });

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
      labelIds,
      internalDate: message.receivedDateTime || new Date().toISOString(),
      historyId: "",
      inline: [],
    };
  });
}

export async function getMessage(
  messageId: string,
  client: OutlookClient,
): Promise<ParsedMessage> {
  const message = await client
    .getClient()
    .api(`/me/messages/${messageId}`)
    .select(
      "id,conversationId,subject,bodyPreview,from,sender,toRecipients,receivedDateTime,isDraft,body,categories,parentFolderId",
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
    labelIds: getOutlookLabels(message, {}),
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
      "id,conversationId,subject,bodyPreview,body,from,toRecipients,receivedDateTime,categories,parentFolderId",
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
    labelIds: getOutlookLabels(message, {}),
    historyId: "",
    inline: [],
    internalDate: message.receivedDateTime || new Date().toISOString(),
  };
}
