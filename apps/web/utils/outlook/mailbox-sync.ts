import type { Message } from "@microsoft/microsoft-graph-types";
import {
  compactMailboxSyncMessage,
  decodeMailboxSyncCursor,
  encodeMailboxSyncCursor,
} from "@/utils/email/mailbox-sync";
import type { MailboxSyncPage } from "@/utils/email/types";
import type { Logger } from "@/utils/logger";
import type { OutlookClient } from "@/utils/outlook/client";
import { getCategoryMap, convertMessage } from "@/utils/outlook/message";
import { extractErrorInfo, withOutlookRetry } from "@/utils/outlook/retry";

const MESSAGE_SELECT_FIELDS =
  "id,conversationId,conversationIndex,internetMessageId,subject,bodyPreview,from,toRecipients,ccRecipients,receivedDateTime,isDraft,isRead,categories,parentFolderId,webLink";

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
  limit,
}: {
  client: OutlookClient;
  logger: Logger;
  cursor?: string;
  after?: Date;
  limit: number;
}): Promise<MailboxSyncPage> {
  if (!cursor) {
    if (!after) throw new Error("after is required for initial mailbox sync");
    return getInitialPage({ client, logger, after, limit, reset: true });
  }

  const decoded = decodeMailboxSyncCursor(cursor, "microsoft");
  if (decoded.provider !== "microsoft") {
    throw new Error("Expected Microsoft mailbox sync cursor");
  }

  try {
    const response = await withOutlookRetry<DeltaResponse>(
      () =>
        client
          .getClient()
          .api(decoded.deltaLink)
          .header("Prefer", `IdType="ImmutableId", odata.maxpagesize=${limit}`)
          .get(),
      logger,
    );
    return buildOutlookMailboxSyncPage({
      response,
      after: decoded.after,
      wasSnapshot: decoded.snapshot,
      reset: false,
      categoryMap: await getCategoryMap(client, logger),
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
      limit,
      reset: true,
    });
  }
}

export function buildOutlookMailboxSyncPage({
  response,
  after,
  wasSnapshot,
  reset,
  categoryMap,
}: {
  response: DeltaResponse;
  after: string;
  wasSnapshot: boolean;
  reset: boolean;
  categoryMap: Map<string, string>;
}): MailboxSyncPage {
  const nextLink = response["@odata.nextLink"];
  const deltaLink = response["@odata.deltaLink"];
  const continuationLink = nextLink ?? deltaLink;
  if (!continuationLink) {
    throw new Error("Microsoft Graph delta response omitted its cursor");
  }

  const deletedMessageIds: string[] = [];
  const latestMessages = new Map<string, DeltaMessage>();
  for (const message of response.value ?? []) {
    if (message.id) latestMessages.set(message.id, message);
  }

  const upsertedMessages = [...latestMessages.values()].flatMap((message) => {
    if (!message.id) return [];
    if (message["@removed"]) {
      deletedMessageIds.push(message.id);
      return [];
    }

    const folderIds = message.parentFolderId
      ? { inbox: message.parentFolderId }
      : {};
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
      after,
      snapshot: Boolean(nextLink) && wasSnapshot,
    }),
    deletedMessageIds,
    hasMore: Boolean(nextLink) || wasSnapshot,
    reset,
    upsertedMessages,
  };
}

async function getInitialPage({
  client,
  logger,
  after,
  limit,
  reset,
}: {
  client: OutlookClient;
  logger: Logger;
  after: Date;
  limit: number;
  reset: boolean;
}) {
  const response = await withOutlookRetry<DeltaResponse>(
    () =>
      client
        .getClient()
        .api("/me/mailFolders/inbox/messages/delta")
        .select(MESSAGE_SELECT_FIELDS)
        .filter(`receivedDateTime ge ${after.toISOString()}`)
        .top(limit)
        .header("Prefer", `IdType="ImmutableId", odata.maxpagesize=${limit}`)
        .get(),
    logger,
  );

  return buildOutlookMailboxSyncPage({
    response,
    after: after.toISOString(),
    wasSnapshot: true,
    reset,
    categoryMap: await getCategoryMap(client, logger),
  });
}
