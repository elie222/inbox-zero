import type { Message } from "@microsoft/microsoft-graph-types";
import type { ParsedMessage } from "@/utils/types";
import { createScopedLogger } from "@/utils/logger";
import type { OutlookClient } from "@/utils/outlook/client";
import { OutlookLabel } from "./label";
import { escapeODataString } from "@/utils/outlook/odata-escape";

const logger = createScopedLogger("outlook/message");

/**
 * Removes quoted string literals from a query string to avoid false positives
 * when checking for identifiers that might appear inside quotes.
 * Handles both single and double quotes, including escaped quotes.
 */
function stripQuotedLiterals(query: string): string {
  let result = "";
  let i = 0;

  while (i < query.length) {
    const char = query[i];

    if (char === "'" || char === '"') {
      const quote = char;
      i++; // Skip opening quote

      // Skip until we find the matching closing quote (or end of string)
      while (i < query.length) {
        const current = query[i];
        if (current === quote) {
          // Found closing quote, check if it's escaped
          let backslashCount = 0;
          let j = i - 1;
          while (j >= 0 && query[j] === "\\") {
            backslashCount++;
            j--;
          }

          // If even number of backslashes (including 0), quote is not escaped
          if (backslashCount % 2 === 0) {
            i++; // Skip closing quote
            break;
          }
        }
        i++;
      }

      // Replace the entire quoted section with spaces to maintain positions
      // This prevents issues with adjacent identifiers
      result += " ";
    } else {
      result += char;
      i++;
    }
  }

  return result;
}

/**
 * Checks if parentFolderId appears as an unquoted identifier in the query.
 * This avoids false positives when parentFolderId appears inside string literals.
 */
export function hasUnquotedParentFolderId(query: string): boolean {
  const cleanedQuery = stripQuotedLiterals(query);
  return /\bparentFolderId\b/.test(cleanedQuery);
}

// Cache for folder IDs
let folderIdCache: Record<string, string> | null = null;

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
        logger.warn("Failed to get well-known folder", {
          folderName,
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

  logger.info("Building Outlook request", {
    maxResults,
    hasSearchQuery: !!searchQuery,
    hasDateFilters: !!(dateFilters && dateFilters.length > 0),
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

  // Determine if we have a search query vs pure filters
  const hasSearchQuery = !!searchQuery?.trim();
  const hasDateFilters = !!(dateFilters && dateFilters.length > 0);

  // Always filter to only include inbox and archive folders
  const inboxFolderId = folderIds.inbox;
  const archiveFolderId = folderIds.archive;

  if (!inboxFolderId || !archiveFolderId) {
    logger.warn("Missing required folder IDs", {
      inboxFolderId,
      archiveFolderId,
    });
  }

  // Build folder filter for all cases
  const folderFilter = folderId
    ? `parentFolderId eq '${escapeODataString(folderId)}'`
    : `(parentFolderId eq '${escapeODataString(inboxFolderId)}' or parentFolderId eq '${escapeODataString(archiveFolderId)}')`;

  if (hasSearchQuery) {
    // Search path - use $search parameter
    logger.info("Using search path", {
      searchQuery,
      folderFilter,
    });

    request = request.search(searchQuery!.trim());

    // Apply folder filtering via post-processing since $search can't be combined with $filter
    if (pageToken) {
      request = request.skipToken(pageToken);
    }

    const response: { value: Message[]; "@odata.nextLink"?: string } =
      await request.get();

    // Filter messages to only include inbox and archive folders
    const filteredMessages = response.value.filter((message) => {
      if (folderId) {
        return message.parentFolderId === folderId;
      }
      return (
        message.parentFolderId === inboxFolderId ||
        message.parentFolderId === archiveFolderId
      );
    });
    const messages = await convertMessages(filteredMessages, folderIds);

    nextPageToken = response["@odata.nextLink"]
      ? new URL(response["@odata.nextLink"]).searchParams.get("$skiptoken") ||
        undefined
      : undefined;

    logger.info("Search results", {
      totalFound: response.value.length,
      afterFolderFiltering: filteredMessages.length,
      messageCount: messages.length,
      hasNextPageToken: !!nextPageToken,
    });

    return { messages, nextPageToken };
  } else {
    // Filter path - use $filter parameter for date filters or folder-only queries
    const filters = [folderFilter];

    // Add date filters if provided
    if (hasDateFilters) {
      filters.push(...dateFilters!);
    }

    const combinedFilter = filters.join(" and ");

    logger.info("Using filter path", {
      folderFilter,
      dateFilters: dateFilters || [],
      combinedFilter,
    });

    request = request.filter(combinedFilter);

    if (pageToken) {
      request = request.skipToken(pageToken);
    } else {
      // Only add orderby for non-paginated requests to avoid sorting complexity errors
      request = request.orderby("receivedDateTime DESC");
    }

    const response: { value: Message[]; "@odata.nextLink"?: string } =
      await request.get();
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
  let request = client
    .getClient()
    .api("/me/messages")
    .select(
      "id,conversationId,conversationIndex,subject,bodyPreview,from,sender,toRecipients,receivedDateTime,isDraft,isRead,body,categories,parentFolderId",
    )
    .top(maxResults);

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
    await request.get();

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
  const message = await client
    .getClient()
    .api(`/me/messages/${messageId}`)
    .select(
      "id,conversationId,conversationIndex,subject,bodyPreview,from,sender,toRecipients,receivedDateTime,isDraft,isRead,body,categories,parentFolderId",
    )
    .get();

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
    request = request.filter(
      `contains(subject, '${escapeODataString(options.query)}')`,
    );
  }

  const response: { value: Message[]; "@odata.nextLink"?: string } =
    await request.get();

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
