import type { Message } from "@microsoft/microsoft-graph-types";
import {
  compactMailboxSyncMessage,
  decodeMailboxSyncCursor,
  encodeMailboxSyncCursor,
  InvalidMailboxSyncCursorError,
} from "@/utils/email/mailbox-sync";
import type { MailboxSyncPage } from "@/utils/email/types";
import type { Logger } from "@/utils/logger";
import type { OutlookClient } from "@/utils/outlook/client";
import {
  getCategoryMap,
  convertMessage,
  getFolderIds,
} from "@/utils/outlook/message";
import {
  extractErrorInfo,
  withMicrosoftGraphRetry,
} from "@/utils/microsoft/retry";
import { isNotFoundError } from "@/utils/outlook/errors";

const MESSAGE_SELECT_FIELDS =
  "id,conversationId,conversationIndex,internetMessageId,subject,bodyPreview,from,toRecipients,ccRecipients,receivedDateTime,isDraft,isRead,flag,categories,parentFolderId,hasAttachments,webLink,inferenceClassification";

type DeltaMessage = Message & {
  "@removed"?: { reason?: string };
};

type DeltaResponse = {
  value?: DeltaMessage[];
  "@odata.nextLink"?: string;
  "@odata.deltaLink"?: string;
};

export async function getOutlookMailboxSyncPage({
  client,
  logger,
  cursor,
  after,
  folderId,
  limit,
}: {
  client: OutlookClient;
  logger: Logger;
  cursor?: string;
  after?: Date;
  folderId?: string;
  limit: number;
}): Promise<MailboxSyncPage> {
  if (!cursor) {
    if (!after) throw new Error("after is required for initial mailbox sync");
    return getInitialPage({ client, logger, after, folderId, limit });
  }

  const decoded = decodeMailboxSyncCursor(cursor, "microsoft");
  if (folderId && decoded.folderId && folderId !== decoded.folderId) {
    throw new InvalidMailboxSyncCursorError();
  }
  try {
    const deltaResponse = await withMicrosoftGraphRetry<DeltaResponse>(
      () =>
        client
          .getClient()
          .api(decoded.deltaLink)
          .header("Prefer", `IdType="ImmutableId", odata.maxpagesize=${limit}`)
          .get(),
      logger,
    );
    const response = await withPartialMessagesRefetched({
      client,
      logger,
      response: deltaResponse,
    });
    const [categoryMap, folderIds] = await Promise.all([
      getCategoryMap(client, logger),
      getFolderIds(client, logger),
    ]);
    return buildOutlookMailboxSyncPage({
      response,
      after: decoded.after,
      folderId: decoded.folderId ?? folderId,
      wasSnapshot: decoded.snapshot,
      reset: false,
      categoryMap,
      folderIds,
    });
  } catch (error) {
    const { status, code } = extractErrorInfo(error);
    if (
      status !== 410 &&
      code !== "SyncStateNotFound" &&
      code !== "resyncRequired"
    ) {
      throw error;
    }
    return getInitialPage({
      client,
      logger,
      after: new Date(decoded.after),
      folderId: decoded.folderId ?? folderId,
      limit,
    });
  }
}

export function buildOutlookMailboxSyncPage({
  response,
  after,
  folderId,
  wasSnapshot,
  reset,
  categoryMap,
  folderIds = {},
}: {
  response: DeltaResponse;
  after: string;
  folderId?: string;
  wasSnapshot: boolean;
  reset: boolean;
  categoryMap: Map<string, string>;
  folderIds?: Record<string, string>;
}): MailboxSyncPage {
  const nextLink = response["@odata.nextLink"];
  const deltaLink = response["@odata.deltaLink"];
  const continuationLink = nextLink ?? deltaLink;
  if (!continuationLink) {
    throw new Error("Microsoft Graph delta response omitted its cursor");
  }

  const deletedMessageIds: string[] = [];
  const removedMessageIds: string[] = [];
  const latestMessages = new Map<string, DeltaMessage>();
  for (const message of response.value ?? []) {
    if (message.id) latestMessages.set(message.id, message);
  }

  const upsertedMessages = [...latestMessages.values()].flatMap((message) => {
    if (!message.id) return [];
    if (message["@removed"]) {
      if (message["@removed"].reason === "deleted") {
        deletedMessageIds.push(message.id);
      } else {
        removedMessageIds.push(message.id);
      }
      return [];
    }
    if (!message.conversationId) return [];

    return [
      compactMailboxSyncMessage(
        convertMessage(message, folderIds, categoryMap),
      ),
    ];
  });

  return {
    cursor: encodeMailboxSyncCursor({
      version: 1,
      provider: "microsoft",
      deltaLink: continuationLink,
      ...(folderId ? { folderId } : {}),
      after,
      snapshot: Boolean(nextLink) && wasSnapshot,
    }),
    deletedMessageIds,
    hasMore: Boolean(nextLink),
    removedMessageIds,
    reset,
    upsertedMessages,
  };
}

async function getInitialPage({
  client,
  logger,
  after,
  folderId,
  limit,
}: {
  client: OutlookClient;
  logger: Logger;
  after: Date;
  folderId?: string;
  limit: number;
}) {
  const resolvedFolderId = folderId ?? "inbox";
  const snapshotResponse = await withMicrosoftGraphRetry<DeltaResponse>(
    () =>
      client
        .getClient()
        .api(
          `/me/mailFolders/${encodeURIComponent(resolvedFolderId)}/messages/delta`,
        )
        .select(MESSAGE_SELECT_FIELDS)
        .filter(`receivedDateTime ge ${after.toISOString()}`)
        .top(limit)
        .header("Prefer", `IdType="ImmutableId", odata.maxpagesize=${limit}`)
        .get(),
    logger,
  );
  const response = await withPartialMessagesRefetched({
    client,
    logger,
    response: snapshotResponse,
  });

  const [categoryMap, folderIds] = await Promise.all([
    getCategoryMap(client, logger),
    getFolderIds(client, logger),
  ]);
  return buildOutlookMailboxSyncPage({
    response,
    after: after.toISOString(),
    folderId: resolvedFolderId,
    wasSnapshot: true,
    reset: true,
    categoryMap,
    folderIds,
  });
}

// Graph delta can return a message without its conversation, which the sync
// protocol requires, so fetch those individually instead of failing the page.
async function withPartialMessagesRefetched({
  client,
  logger,
  response,
}: {
  client: OutlookClient;
  logger: Logger;
  response: DeltaResponse;
}): Promise<DeltaResponse> {
  const messages = response.value ?? [];
  if (!messages.some(isPartialMessage)) return response;

  const refetched: DeltaMessage[] = [];
  let unresolvedCount = 0;
  for (const message of messages) {
    if (!isPartialMessage(message)) {
      refetched.push(message);
      continue;
    }

    const fullMessage = await getSyncMessage({
      client,
      logger,
      messageId: message.id,
    });
    if (fullMessage?.conversationId) refetched.push(fullMessage);
    else unresolvedCount++;
  }

  if (unresolvedCount > 0) {
    logger.warn("Skipped delta messages without a conversation", {
      unresolvedCount,
    });
  }

  return { ...response, value: refetched };
}

function isPartialMessage(
  message: DeltaMessage,
): message is DeltaMessage & { id: string } {
  return Boolean(message.id && !message["@removed"] && !message.conversationId);
}

async function getSyncMessage({
  client,
  logger,
  messageId,
}: {
  client: OutlookClient;
  logger: Logger;
  messageId: string;
}): Promise<DeltaMessage | null> {
  try {
    return await withMicrosoftGraphRetry<DeltaMessage>(
      () =>
        client
          .getClient()
          .api(`/me/messages/${encodeURIComponent(messageId)}`)
          .select(MESSAGE_SELECT_FIELDS)
          .header("Prefer", 'IdType="ImmutableId"')
          .get(),
      logger,
    );
  } catch (error) {
    if (isNotFoundError(error)) return null;
    throw error;
  }
}
