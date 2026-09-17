import type { gmail_v1 } from "@googleapis/gmail";
import chunk from "lodash/chunk";
import {
  compactMailboxSyncMessage,
  decodeMailboxSyncCursor,
  encodeMailboxSyncCursor,
} from "@/utils/email/mailbox-sync";
import type { MailboxSyncPage } from "@/utils/email/types";
import {
  getMessage,
  getMessagesBatch,
  parseMessage,
} from "@/utils/gmail/message";
import type { ParsedMessage } from "@/utils/types";
import { getHistory } from "@/utils/gmail/history";
import { extractErrorInfo, withGmailRetry } from "@/utils/gmail/retry";
import type { Logger } from "@/utils/logger";

// Archive, read, and star are label events. Gmail does not treat archive as
// messagesDeleted, so mailbox delta sync must ask for labelRemoved explicitly.
const GMAIL_MAILBOX_HISTORY_TYPES = [
  "messageAdded",
  "messageDeleted",
  "labelAdded",
  "labelRemoved",
] as const;

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
        historyTypes: [...GMAIL_MAILBOX_HISTORY_TYPES],
        maxResults: limit,
        pageToken: decoded.pageToken,
      },
      logger,
    );
    const { upsertIds, deletedIds, changedThreadIds } =
      getGmailMailboxChangeIds(response.history ?? []);
    const fetchedMessages = await fetchMessages({
      gmail,
      messageIds: upsertIds,
      accessToken,
      logger,
    });
    const afterTimestamp = new Date(decoded.after).getTime();
    const upsertedMessages = fetchedMessages.filter((message) => {
      const inTimeWindow = Number(message.internalDate) >= afterTimestamp;
      if (!inTimeWindow) deletedIds.add(message.id);
      return inTimeWindow;
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
      changedThreadIds: [...changedThreadIds],
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
  changedThreadIds: Set<string>;
} {
  const upsertIds = new Set<string>();
  const deletedIds = new Set<string>();
  const changedThreadIds = new Set<string>();

  for (const record of history) {
    for (const change of [
      ...(record.messagesAdded ?? []),
      ...(record.messagesDeleted ?? []),
      ...(record.labelsAdded ?? []),
      ...(record.labelsRemoved ?? []),
    ]) {
      if (change.message?.threadId)
        changedThreadIds.add(change.message.threadId);
    }
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
    // Typed arrays can be omitted; the summary `messages` list still names
    // every affected id so current labels can be written to the cache.
    for (const message of record.messages ?? []) {
      if (message.threadId) changedThreadIds.add(message.threadId);
      if (message.id) upsertIds.add(message.id);
    }
  }

  for (const messageId of deletedIds) upsertIds.delete(messageId);
  return { upsertIds: [...upsertIds], deletedIds, changedThreadIds };
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
    gmail,
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
  gmail,
  messageIds,
  accessToken,
  logger,
}: {
  gmail: gmail_v1.Gmail;
  messageIds: string[];
  accessToken: string;
  logger: Logger;
}) {
  const messages: ParsedMessage[] = [];
  for (const ids of chunk(messageIds, 100)) {
    const page = await getMessagesBatch({
      messageIds: ids,
      accessToken,
      logger,
    });
    const fetchedIds = new Set(page.map((message) => message.id));

    // Shared batch reads may omit failed items. Sync can advance only when
    // each omission has been recovered or confirmed deleted by the provider.
    for (const id of ids) {
      if (fetchedIds.has(id)) continue;
      try {
        const message = await getMessage(id, gmail, "full");
        if (message.id !== id) {
          throw new Error("Gmail returned an unexpected message ID");
        }
        page.push(parseMessage(message));
      } catch (error) {
        if (extractErrorInfo(error).status !== 404) throw error;
      }
    }
    messages.push(...page.map(compactMailboxSyncMessage));
  }
  return messages;
}
