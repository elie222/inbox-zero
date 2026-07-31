import type { gmail_v1 } from "@googleapis/gmail";
import chunk from "lodash/chunk";
import {
  compactMailboxSyncMessage,
  decodeMailboxSyncCursor,
  encodeMailboxSyncCursor,
} from "@/utils/email/mailbox-sync";
import type { MailboxSyncPage } from "@/utils/email/types";
import { getMessagesBatch } from "@/utils/gmail/message";
import { getHistory } from "@/utils/gmail/history";
import { GmailLabel } from "@/utils/gmail/label";
import { extractErrorInfo, withGmailRetry } from "@/utils/gmail/retry";
import type { Logger } from "@/utils/logger";

export async function getGmailMailboxSyncPage({
  gmail,
  accessToken,
  logger,
  cursor,
  after,
  limit,
}: {
  gmail: gmail_v1.Gmail;
  accessToken: string;
  logger: Logger;
  cursor?: string;
  after?: Date;
  limit: number;
}): Promise<MailboxSyncPage> {
  if (!cursor) {
    if (!after) throw new Error("after is required for initial mailbox sync");
    return getGmailSnapshotPage({
      gmail,
      accessToken,
      logger,
      after,
      limit,
      reset: true,
    });
  }

  const decoded = decodeMailboxSyncCursor(cursor, "google");
  if (decoded.phase === "snapshot") {
    return getGmailSnapshotPage({
      gmail,
      accessToken,
      logger,
      after: new Date(decoded.after),
      historyId: decoded.historyId,
      pageToken: decoded.pageToken,
      limit,
      reset: false,
    });
  }

  try {
    const response = await getHistory(
      gmail,
      {
        startHistoryId: decoded.historyId,
        maxResults: limit,
        pageToken: decoded.pageToken,
      },
      logger,
    );
    const { upsertIds, deletedIds } = getGmailMailboxChangeIds(
      response.history ?? [],
    );
    const fetchedMessages = await fetchMessages({
      messageIds: upsertIds,
      accessToken,
      logger,
    });
    const afterTimestamp = new Date(decoded.after).getTime();
    const upsertedMessages = fetchedMessages.filter((message) => {
      const isInSnapshotScope =
        message.labelIds?.includes(GmailLabel.INBOX) &&
        Number(message.internalDate) >= afterTimestamp;
      if (!isInSnapshotScope) deletedIds.add(message.id);
      return isInSnapshotScope;
    });
    const fetchedIds = new Set(fetchedMessages.map((message) => message.id));
    for (const messageId of upsertIds) {
      if (!fetchedIds.has(messageId)) deletedIds.add(messageId);
    }

    const nextHistoryId = response.nextPageToken
      ? decoded.historyId
      : (response.historyId ?? decoded.historyId);
    return {
      cursor: encodeMailboxSyncCursor({
        version: 1,
        provider: "google",
        phase: "delta",
        historyId: nextHistoryId,
        after: decoded.after,
        pageToken: response.nextPageToken ?? undefined,
      }),
      deletedMessageIds: [...deletedIds],
      hasMore: Boolean(response.nextPageToken),
      reset: false,
      upsertedMessages,
    };
  } catch (error) {
    if (extractErrorInfo(error).status !== 404) throw error;

    return getGmailSnapshotPage({
      gmail,
      accessToken,
      logger,
      after: new Date(decoded.after),
      limit,
      reset: true,
    });
  }
}

export function getGmailMailboxChangeIds(history: gmail_v1.Schema$History[]): {
  upsertIds: string[];
  deletedIds: Set<string>;
} {
  const upsertIds = new Set<string>();
  const deletedIds = new Set<string>();

  for (const record of history) {
    for (const change of record.messagesAdded ?? []) {
      if (change.message?.id) upsertIds.add(change.message.id);
    }
    for (const change of record.labelsAdded ?? []) {
      if (change.message?.id) upsertIds.add(change.message.id);
    }
    for (const change of record.labelsRemoved ?? []) {
      if (change.message?.id) upsertIds.add(change.message.id);
    }
    for (const change of record.messagesDeleted ?? []) {
      if (change.message?.id) deletedIds.add(change.message.id);
    }
  }

  for (const messageId of deletedIds) upsertIds.delete(messageId);
  return { upsertIds: [...upsertIds], deletedIds };
}

async function getGmailSnapshotPage({
  gmail,
  accessToken,
  logger,
  after,
  limit,
  reset,
  historyId,
  pageToken,
}: {
  gmail: gmail_v1.Gmail;
  accessToken: string;
  logger: Logger;
  after: Date;
  limit: number;
  reset: boolean;
  historyId?: string;
  pageToken?: string;
}): Promise<MailboxSyncPage> {
  const snapshotHistoryId =
    historyId ??
    (
      await withGmailRetry(() => gmail.users.getProfile({ userId: "me" }), 5, {
        logger,
      })
    ).data.historyId;
  if (!snapshotHistoryId) {
    throw new Error("Gmail did not return a mailbox history ID");
  }

  const response = await withGmailRetry(
    () =>
      gmail.users.messages.list({
        userId: "me",
        labelIds: ["INBOX"],
        q: `after:${Math.floor(after.getTime() / 1000)}`,
        maxResults: limit,
        pageToken,
      }),
    5,
    { logger },
  );
  const upsertedMessages = await fetchMessages({
    messageIds: (response.data.messages ?? []).flatMap((message) =>
      message.id ? [message.id] : [],
    ),
    accessToken,
    logger,
  });
  const nextPageToken = response.data.nextPageToken ?? undefined;

  return {
    cursor: encodeMailboxSyncCursor({
      version: 1,
      provider: "google",
      phase: nextPageToken ? "snapshot" : "delta",
      historyId: snapshotHistoryId,
      after: after.toISOString(),
      pageToken: nextPageToken,
    }),
    deletedMessageIds: [],
    hasMore: true,
    reset,
    upsertedMessages,
  };
}

async function fetchMessages({
  messageIds,
  accessToken,
  logger,
}: {
  messageIds: string[];
  accessToken: string;
  logger: Logger;
}) {
  const pages = await Promise.all(
    chunk(messageIds, 100).map((ids) =>
      getMessagesBatch({
        messageIds: ids,
        accessToken,
        logger,
      }),
    ),
  );
  return pages.flat().map(compactMailboxSyncMessage);
}
