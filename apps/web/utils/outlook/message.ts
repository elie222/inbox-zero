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

export async function getFolderIds(client: OutlookClient) {
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

  // Check if message is a draft
  if (message.isDraft) {
    labels.push(OutlookLabel.DRAFT);
  }

  // Handle read/unread status - Outlook uses isRead property, not a label
  // isRead can be true, false, or undefined/null
  if (message.isRead === false) {
    labels.push(OutlookLabel.UNREAD);
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
    } else if (folderKey === "archive") {
      labels.push(OutlookLabel.ARCHIVE);
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

  return labels;
}

export async function queryBatchMessages(
  client: OutlookClient,
  {
    query,
    maxResults = 20,
    pageToken,
    folderId,
  }: {
    query?: string;
    maxResults?: number;
    pageToken?: string;
    folderId?: string;
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
    folderId,
  });

  // Build the base request
  let request = client
    .getClient()
    .api("/me/messages")
    .select(
      "id,conversationId,conversationIndex,subject,bodyPreview,from,sender,toRecipients,receivedDateTime,isDraft,isRead,body,categories,parentFolderId",
    )
    .top(maxResults);

  let nextPageToken: string | undefined;

  // Check if query is an OData filter (contains operators like eq, gt, lt, etc.)
  const isODataFilter =
    query?.includes(" eq ") ||
    query?.includes(" gt ") ||
    query?.includes(" lt ") ||
    query?.includes(" ge ") ||
    query?.includes(" le ") ||
    query?.includes(" ne ") ||
    query?.includes(" and ") ||
    query?.includes(" or ");

  // Always filter to only include inbox and archive folders
  const inboxFolderId = folderIds.inbox;
  const archiveFolderId = folderIds.archive;

  if (!inboxFolderId || !archiveFolderId) {
    logger.warn("Missing required folder IDs", {
      inboxFolderId,
      archiveFolderId,
    });
  }

  if (query?.trim()) {
    if (isODataFilter) {
      // Filter path - use filter and skipToken
      // Combine the existing filter with folder restrictions
      const folderFilter = `(parentFolderId eq '${inboxFolderId}' or parentFolderId eq '${archiveFolderId}')`;
      const combinedFilter = query.trim()
        ? `${query.trim()} and ${folderFilter}`
        : folderFilter;
      request = request.filter(combinedFilter);

      if (pageToken) {
        request = request.skipToken(pageToken);
      }

      const response = await request.get();
      const messages = await convertMessages(response.value, folderIds);

      // For filter, get next page token from @odata.nextLink
      nextPageToken = response["@odata.nextLink"]
        ? new URL(response["@odata.nextLink"]).searchParams.get("$skiptoken") ||
          undefined
        : undefined;

      logger.info("Filter results", {
        messageCount: messages.length,
        hasNextPageToken: !!nextPageToken,
      });

      return { messages, nextPageToken };
    } else {
      // Search path - use search and skipToken
      request = request.search(query.trim());

      if (pageToken) {
        request = request.skipToken(pageToken);
      }

      const response = await request.get();
      // Filter messages to only include inbox and archive folders
      const filteredMessages = response.value.filter(
        (message: Message) =>
          message.parentFolderId === inboxFolderId ||
          message.parentFolderId === archiveFolderId,
      );
      const messages = await convertMessages(filteredMessages, folderIds);

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
    }
  } else {
    // Non-search path - use filter, skip and orderBy
    // Always filter to only include inbox and archive folders
    const folderFilter = `(parentFolderId eq '${inboxFolderId}' or parentFolderId eq '${archiveFolderId}')`;

    // If a specific folder is requested, override the default filter
    if (folderId) {
      request = request.filter(`parentFolderId eq '${folderId}'`);
    } else {
      request = request.filter(folderFilter);
    }

    request = request
      .skip(pageToken ? Number.parseInt(pageToken, 10) : 0)
      .orderby("receivedDateTime DESC");

    const response = await request.get();
    const messages = await convertMessages(response.value, folderIds);

    // For non-search, calculate next page token based on message count
    const hasMore = messages.length === maxResults;
    nextPageToken = hasMore
      ? (pageToken
          ? Number.parseInt(pageToken, 10) + maxResults
          : maxResults
        ).toString()
      : undefined;

    logger.info("Non-search results", {
      messageCount: messages.length,
      skip: pageToken ? Number.parseInt(pageToken, 10) : 0,
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
  return messages
    .filter((message: Message) => !message.isDraft) // Filter out drafts
    .map((message: Message) => convertMessage(message, folderIds));
}

export async function getMessage(
  messageId: string,
  client: OutlookClient,
): Promise<ParsedMessage> {
  const message = await client
    .getClient()
    .api(`/me/messages/${messageId}`)
    .select(
      "id,conversationId,conversationIndex,subject,bodyPreview,from,sender,toRecipients,receivedDateTime,isDraft,isRead,body,categories,parentFolderId",
    )
    .get();

  // Get folder IDs to properly map labels
  const folderIds = await getFolderIds(client);

  return convertMessage(message, folderIds);
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
      "id,conversationId,conversationIndex,subject,bodyPreview,body,from,toRecipients,receivedDateTime,isRead,categories,parentFolderId,isDraft",
    );

  if (options.query) {
    request = request.filter(`contains(subject, '${options.query}')`);
  }

  const response = await request.get();

  // Get folder IDs to properly map labels
  const folderIds = await getFolderIds(client);
  const messages = await convertMessages(response.value, folderIds);

  return {
    messages,
    nextPageToken: response["@odata.nextLink"],
  };
}

export function convertMessage(
  message: Message,
  folderIds: Record<string, string> = {},
): ParsedMessage {
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
    subject: message.subject || "",
    date: message.receivedDateTime || new Date().toISOString(),
    labelIds: getOutlookLabels(message, folderIds),
    internalDate: message.receivedDateTime || new Date().toISOString(),
    historyId: "",
    inline: [],
    conversationIndex: message.conversationIndex,
  };
}
