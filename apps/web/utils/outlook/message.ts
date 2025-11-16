import type { Message } from "@microsoft/microsoft-graph-types";
import type { ParsedMessage } from "@/utils/types";
import { createScopedLogger } from "@/utils/logger";
import type { OutlookClient } from "@/utils/outlook/client";
import { OutlookLabel } from "./label";
import { escapeODataString } from "@/utils/outlook/odata-escape";
import { withOutlookRetry } from "@/utils/outlook/retry";
import { formatEmailWithName } from "@/utils/email";

const logger = createScopedLogger("outlook/message");

// Standard fields to select when fetching messages from Microsoft Graph API
export const MESSAGE_SELECT_FIELDS =
  "id,conversationId,conversationIndex,subject,bodyPreview,from,sender,toRecipients,ccRecipients,receivedDateTime,isDraft,isRead,body,categories,parentFolderId";

// Well-known folder names in Outlook that are consistent across all languages
export const WELL_KNOWN_FOLDERS = {
  inbox: "inbox",
  sentitems: "sentitems",
  drafts: "drafts",
  archive: "archive",
  deleteditems: "deleteditems",
  junkemail: "junkemail",
} as const;

export async function getFolderIds(client: OutlookClient) {
  const cachedFolderIds = client.getFolderIdCache();
  if (cachedFolderIds) return cachedFolderIds;

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
        logger.warn("Failed to get well-known folder", {
          folderName,
          error,
        });
        return [key, null];
      }
    }),
  );

  const userFolderIds = wellKnownFolders.reduce(
    (acc, [key, id]) => {
      if (id) acc[key] = id;
      return acc;
    },
    {} as Record<string, string>,
  );

  client.setFolderIdCache(userFolderIds);

  return userFolderIds;
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

    if (folderKey) {
      const FOLDER_TO_LABEL_MAP = {
        [WELL_KNOWN_FOLDERS.inbox]: OutlookLabel.INBOX,
        [WELL_KNOWN_FOLDERS.sentitems]: OutlookLabel.SENT,
        [WELL_KNOWN_FOLDERS.drafts]: OutlookLabel.DRAFT,
        [WELL_KNOWN_FOLDERS.archive]: OutlookLabel.ARCHIVE,
        [WELL_KNOWN_FOLDERS.junkemail]: OutlookLabel.SPAM,
        [WELL_KNOWN_FOLDERS.deleteditems]: OutlookLabel.TRASH,
      };

      const label =
        FOLDER_TO_LABEL_MAP[folderKey as keyof typeof FOLDER_TO_LABEL_MAP];
      if (label) {
        labels.push(label);
      }
    }
  }

  // Add category labels
  if (message.categories) {
    labels.push(...message.categories);
  }

  // Remove duplicates
  return [...new Set(labels)];
}

const OUTLOOK_SEARCH_DISALLOWED_CHARS = /[?]/g;

function sanitizeOutlookSearchQuery(query: string): {
  sanitized: string;
  wasSanitized: boolean;
} {
  const normalized = query.trim();
  if (!normalized) {
    return { sanitized: "", wasSanitized: false };
  }

  const sanitized = normalized
    .replace(OUTLOOK_SEARCH_DISALLOWED_CHARS, " ")
    .replace(/\s+/g, " ")
    .trim();

  return {
    sanitized,
    wasSanitized: sanitized !== normalized,
  };
}

export async function queryBatchMessages(
  client: OutlookClient,
  options: {
    searchQuery?: string; // Pure search query
    dateFilters?: string[]; // Array of OData date filters
    maxResults?: number;
    pageToken?: string;
    folderId?: string;
  },
) {
  const { searchQuery, dateFilters, pageToken, folderId } = options;

  const MAX_RESULTS = 20;

  const maxResults = Math.min(options.maxResults || MAX_RESULTS, MAX_RESULTS);

  // Is this true for Microsoft Graph API or was it copy pasted from Gmail?
  if (options.maxResults && options.maxResults > MAX_RESULTS) {
    logger.warn(
      "Max results is greater than 20, which will cause rate limiting",
      {
        maxResults,
      },
    );
  }

  const folderIds = await getFolderIds(client);

  const rawSearchQuery = searchQuery?.trim() || "";
  const { sanitized: cleanedSearchQuery, wasSanitized } =
    sanitizeOutlookSearchQuery(rawSearchQuery);
  const effectiveSearchQuery = cleanedSearchQuery || undefined;

  logger.info("Building Outlook request", {
    maxResults,
    hasSearchQuery: !!effectiveSearchQuery,
    hasDateFilters: !!(dateFilters && dateFilters.length > 0),
    pageToken,
    folderId,
    queryWasSanitized: wasSanitized,
  });

  // Build the base request
  let request = createMessagesRequest(client).top(maxResults);

  let nextPageToken: string | undefined;

  // Determine if we have a search query vs pure filters
  const hasSearchQuery = !!effectiveSearchQuery;
  const hasDateFilters = !!(dateFilters && dateFilters.length > 0);

  // Only apply folder filtering if a specific folderId is requested
  // API already excludes Junk/Deleted by default, and drafts are filtered in convertMessages
  const folderFilter = folderId
    ? `parentFolderId eq '${escapeODataString(folderId)}'`
    : undefined;

  if (hasSearchQuery) {
    // Search path - use $search parameter
    logger.info("Using search path", {
      rawSearchQuery,
      effectiveSearchQuery,
      queryWasSanitized: wasSanitized,
      folderFilter,
    });

    request = request.search(effectiveSearchQuery!);

    // Apply folder filtering via post-processing since $search can't be combined with $filter
    if (pageToken) {
      request = request.skipToken(pageToken);
    }

    const response: { value: Message[]; "@odata.nextLink"?: string } =
      await withOutlookRetry(() => request.get());

    // Filter to specific folder if requested, otherwise get all
    const filteredMessages = folderId
      ? response.value.filter((message) => message.parentFolderId === folderId)
      : response.value;
    const messages = await convertMessages(filteredMessages, folderIds);

    nextPageToken = response["@odata.nextLink"]
      ? new URL(response["@odata.nextLink"]).searchParams.get("$skiptoken") ||
        undefined
      : undefined;

    logger.info("Search results", {
      totalFound: response.value.length,
      filteredByFolder: folderId ? filteredMessages.length : undefined,
      messageCount: messages.length,
      hasNextPageToken: !!nextPageToken,
    });

    return { messages, nextPageToken };
  } else {
    // Filter path - use $filter parameter for date filters or folder-only queries
    const filters: string[] = [];

    // Add folder filter if a specific folder is requested
    if (folderFilter) {
      filters.push(folderFilter);
    }

    // Add date filters if provided
    if (hasDateFilters) {
      filters.push(...dateFilters!);
    }

    const combinedFilter =
      filters.length > 0 ? filters.join(" and ") : undefined;

    logger.info("Using filter path", {
      folderFilter,
      dateFilters: dateFilters || [],
      combinedFilter,
    });

    // Only apply filter if we have something to filter
    if (combinedFilter) {
      request = request.filter(combinedFilter);
    }

    if (pageToken) {
      request = request.skipToken(pageToken);
    } else {
      // Only add orderby for non-paginated requests to avoid sorting complexity errors
      request = request.orderby("receivedDateTime DESC");
    }

    const response: { value: Message[]; "@odata.nextLink"?: string } =
      await withOutlookRetry(() => request.get());
    const messages = await convertMessages(response.value, folderIds);

    nextPageToken = response["@odata.nextLink"]
      ? new URL(response["@odata.nextLink"]).searchParams.get("$skiptoken") ||
        undefined
      : undefined;

    logger.info("Filter results", {
      messageCount: messages.length,
      hasNextPageToken: !!nextPageToken,
      combinedFilter,
    });

    return { messages, nextPageToken };
  }
}

export async function queryMessagesWithFilters(
  client: OutlookClient,
  options: {
    filters?: string[]; // OData filter expressions to AND together
    dateFilters?: string[]; // additional date filters like receivedDateTime gt/lt
    maxResults?: number;
    pageToken?: string;
    folderId?: string; // if omitted, defaults to inbox OR archive
  },
) {
  const { filters = [], dateFilters = [], pageToken, folderId } = options;

  const MAX_RESULTS = 20;
  const maxResults = Math.min(options.maxResults || MAX_RESULTS, MAX_RESULTS);
  if (options.maxResults && options.maxResults > MAX_RESULTS) {
    logger.warn(
      "Max results is greater than 20, which will cause rate limiting",
      {
        maxResults: options.maxResults,
      },
    );
  }

  const folderIds = await getFolderIds(client);
  const inboxFolderId = folderIds.inbox;
  const archiveFolderId = folderIds.archive;

  // Build base request
  let request = createMessagesRequest(client).top(maxResults);

  // Build folder filter safely (avoid empty IDs)
  let folderFilter: string | undefined;
  if (folderId) {
    folderFilter = `parentFolderId eq '${escapeODataString(folderId)}'`;
  } else {
    const folderClauses: string[] = [];
    if (inboxFolderId) {
      folderClauses.push(
        `parentFolderId eq '${escapeODataString(inboxFolderId)}'`,
      );
    }
    if (archiveFolderId) {
      folderClauses.push(
        `parentFolderId eq '${escapeODataString(archiveFolderId)}'`,
      );
    }
    if (folderClauses.length === 1) {
      folderFilter = folderClauses[0];
    } else if (folderClauses.length > 1) {
      folderFilter = `(${folderClauses.join(" or ")})`;
    } else {
      folderFilter = undefined; // omit folder clause entirely if none present
    }
  }

  const combinedFilters = [
    ...(folderFilter ? [folderFilter] : []),
    ...dateFilters,
    ...filters,
  ].filter(Boolean);
  const combinedFilter = combinedFilters.join(" and ");

  request = request.filter(combinedFilter);

  if (pageToken) {
    request = request.skipToken(pageToken);
  }

  const response: { value: Message[]; "@odata.nextLink"?: string } =
    await withOutlookRetry(() => request.get());

  const messages = await convertMessages(response.value, folderIds);
  const nextPageToken = response["@odata.nextLink"]
    ? new URL(response["@odata.nextLink"]).searchParams.get("$skiptoken") ||
      undefined
    : undefined;

  return { messages, nextPageToken };
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
  const message = await withOutlookRetry(() =>
    createMessageRequest(client, messageId).get(),
  );

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
  let request = createMessagesRequest(client).top(top);

  if (options.query) {
    request = request.filter(
      `contains(subject, '${escapeODataString(options.query)}')`,
    );
  }

  const response: { value: Message[]; "@odata.nextLink"?: string } =
    await withOutlookRetry(() => request.get());

  // Get folder IDs to properly map labels
  const folderIds = await getFolderIds(client);
  const messages = await convertMessages(response.value, folderIds);

  return {
    messages,
    nextPageToken: response["@odata.nextLink"],
  };
}

/**
 * Helper to create a request for fetching multiple messages with standard fields selected.
 * Returns a typed request builder that can be chained with .filter(), .top(), etc.
 */
export function createMessagesRequest(client: OutlookClient) {
  return client.getClient().api("/me/messages").select(MESSAGE_SELECT_FIELDS);
}

/**
 * Helper to create a request for fetching a single message with standard fields selected.
 */
export function createMessageRequest(client: OutlookClient, messageId: string) {
  return client
    .getClient()
    .api(`/me/messages/${messageId}`)
    .select(MESSAGE_SELECT_FIELDS);
}

/**
 * Converts Outlook message recipients array to comma-separated string
 * Format: "Name1 <email1@example.com>, Name2 <email2@example.com>"
 */
function formatRecipientsList(
  recipients:
    | Array<{
        emailAddress?: { name?: string | null; address?: string | null } | null;
      }>
    | null
    | undefined,
): string | undefined {
  if (!recipients || recipients.length === 0) return undefined;

  const formatted = recipients
    .map((recipient) =>
      formatEmailWithName(
        recipient.emailAddress?.name,
        recipient.emailAddress?.address,
      ),
    )
    .filter(Boolean)
    .join(", ");

  return formatted || undefined;
}

export function convertMessage(
  message: Message,
  folderIds: Record<string, string> = {},
): ParsedMessage {
  const bodyContent = message.body?.content || "";
  const bodyType = message.body?.contentType?.toLowerCase() as
    | "text"
    | "html"
    | undefined;

  return {
    id: message.id || "",
    threadId: message.conversationId || "",
    snippet: message.bodyPreview || "",
    textPlain: bodyContent,
    textHtml: bodyContent,
    bodyContentType: bodyType,
    headers: {
      from:
        formatEmailWithName(
          message.from?.emailAddress?.name,
          message.from?.emailAddress?.address,
        ) || "",
      to: formatRecipientsList(message.toRecipients) || "",
      cc: formatRecipientsList(message.ccRecipients),
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
    rawRecipients: {
      from: message.from,
      toRecipients: message.toRecipients,
      ccRecipients: message.ccRecipients,
    },
  };
}
