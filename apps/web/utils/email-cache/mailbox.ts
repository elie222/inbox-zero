import { internalDateToDate, sortByInternalDate } from "@/utils/date";
import { canonicalizeEmailAddress } from "@/utils/email";
import type { MailboxSyncPage } from "@/utils/email/types";
import { isIgnoredSender } from "@/utils/filter-ignored-senders";
import type { CombinedListThread } from "@/utils/threads/load-combined";
import type { ThreadListItem } from "@/utils/threads/load";
import { getThreadTimestamp } from "@/utils/threads/sort";
import type { ThreadsQuery } from "@/utils/threads/validation";
import type { ParsedMessage } from "@/utils/types";
import { scheduleEmailCacheCleanup } from "./cleanup";
import {
  captureEmailCacheEpoch,
  getEmailCacheDatabase,
  isEmailCacheEpochCurrent,
  type CachedMailboxMessage,
} from "./database";

const mailboxListeners = new Set<(emailAccountId: string) => void>();
const INDEXED_DB_BATCH_SIZE = 50;
const MAX_LOCAL_QUERY_SCAN_MESSAGES = 500;

export type SyncedMailboxSnapshot = {
  after: string;
  complete: boolean;
  syncedAt: number;
  threads: ThreadListItem[];
  truncated: boolean;
};

export type SyncedCombinedMailboxSnapshot = {
  accountStates: Record<
    string,
    { after: string; complete: boolean; syncedAt: number; truncated: boolean }
  >;
  complete: boolean;
  missingAccountIds: string[];
  threads: CombinedListThread[];
  truncated: boolean;
};

export async function applyMailboxSyncPage({
  emailAccountId,
  page,
  after,
  now = Date.now(),
}: {
  emailAccountId: string;
  page: MailboxSyncPage;
  after?: Date;
  now?: number;
}) {
  const epoch = captureEmailCacheEpoch(emailAccountId);
  const database = await getEmailCacheDatabase();
  if (!database || !isEmailCacheEpochCurrent(emailAccountId, epoch)) return;

  const transaction = database.transaction(
    ["mailboxMessages", "mailboxSyncStates"],
    "readwrite",
  );
  const messages = transaction.objectStore("mailboxMessages");
  const states = transaction.objectStore("mailboxSyncStates");
  const currentState = await states.get(emailAccountId);
  const syncAfter = after?.toISOString() ?? currentState?.after;
  if (!syncAfter) {
    transaction.abort();
    await transaction.done.catch(() => {});
    throw new Error("Mailbox sync reset requires an after date");
  }

  if (page.reset) {
    const messageKeys = await messages
      .index("byAccount")
      .getAllKeys(emailAccountId);
    await Promise.all(messageKeys.map((key) => messages.delete(key)));
  }

  await Promise.all([
    ...page.deletedMessageIds.map((messageId) =>
      messages.delete([emailAccountId, messageId]),
    ),
    ...page.upsertedMessages.map((message) =>
      messages.put(toCachedMailboxMessage(emailAccountId, message, now)),
    ),
    states.put({
      emailAccountId,
      cursor: page.cursor,
      after: syncAfter,
      hasMore: page.hasMore,
      lastSyncedAt: now,
      completedAt: page.hasMore ? currentState?.completedAt : now,
    }),
  ]);
  await transaction.done;

  if (!isEmailCacheEpochCurrent(emailAccountId, epoch)) return;
  scheduleEmailCacheCleanup();
  notifyMailboxStoreChange(emailAccountId);
}

export async function readMailboxSyncState(emailAccountId: string) {
  const epoch = captureEmailCacheEpoch(emailAccountId);
  try {
    const database = await getEmailCacheDatabase();
    if (!database || !isEmailCacheEpochCurrent(emailAccountId, epoch)) return;
    const state = await database.get("mailboxSyncStates", emailAccountId);
    if (!isEmailCacheEpochCurrent(emailAccountId, epoch)) return;
    return state;
  } catch {
    return;
  }
}

export async function readSyncedMailboxThreads({
  emailAccountId,
  query,
  limit = query.limit ?? 50,
}: {
  emailAccountId: string;
  query: ThreadsQuery;
  limit?: number;
}): Promise<SyncedMailboxSnapshot | undefined> {
  if (!isSupportedMailboxQuery(query)) return;
  const epoch = captureEmailCacheEpoch(emailAccountId);

  try {
    const database = await getEmailCacheDatabase();
    if (!database || !isEmailCacheEpochCurrent(emailAccountId, epoch)) return;
    const transaction = database.transaction(
      ["mailboxMessages", "mailboxSyncStates", "threadRows"],
      "readonly",
    );
    const state = await transaction
      .objectStore("mailboxSyncStates")
      .get(emailAccountId);
    if (!state) {
      await transaction.done;
      return;
    }

    const messagesStore = transaction.objectStore("mailboxMessages");
    let records: CachedMailboxMessage[];
    if (isRecentInboxQuery(query)) {
      const selectedThreadIds = new Set<string>();
      let scannedMessages = 0;
      let cursor = await messagesStore
        .index("byAccountReceivedAt")
        .openCursor(
          IDBKeyRange.bound(
            [emailAccountId, Number.MIN_SAFE_INTEGER],
            [emailAccountId, Number.MAX_SAFE_INTEGER],
          ),
          "prev",
        );
      while (
        cursor &&
        selectedThreadIds.size < limit + 1 &&
        scannedMessages < MAX_LOCAL_QUERY_SCAN_MESSAGES
      ) {
        scannedMessages += 1;
        const message = cursor.value.data;
        if (
          message.labelIds?.includes("INBOX") &&
          !isIgnoredSender(message.headers.from)
        ) {
          selectedThreadIds.add(message.threadId);
        }
        cursor = await cursor.continue();
      }
      if (cursor && selectedThreadIds.size < limit + 1) {
        await transaction.done;
        return;
      }
      const byThread = messagesStore.index("byAccountThread");
      records = (
        await Promise.all(
          [...selectedThreadIds].map((threadId) =>
            byThread.getAll([emailAccountId, threadId]),
          ),
        )
      ).flat();
    } else {
      const selectedThreadIds = new Set<string>();
      const selectedRecords: CachedMailboxMessage[][] = [];
      let pendingThreadIds: string[] = [];
      const byThread = messagesStore.index("byAccountThread");
      let scannedMessages = 0;
      let cursor = await messagesStore
        .index("byAccountReceivedAt")
        .openCursor(
          IDBKeyRange.bound(
            [emailAccountId, Number.MIN_SAFE_INTEGER],
            [emailAccountId, Number.MAX_SAFE_INTEGER],
          ),
          "prev",
        );
      while (
        cursor &&
        selectedRecords.length < limit + 1 &&
        scannedMessages < MAX_LOCAL_QUERY_SCAN_MESSAGES
      ) {
        scannedMessages += 1;
        const { threadId } = cursor.value;
        if (!selectedThreadIds.has(threadId)) {
          selectedThreadIds.add(threadId);
          pendingThreadIds.push(threadId);
        }
        cursor = await cursor.continue();
        if (
          pendingThreadIds.length < INDEXED_DB_BATCH_SIZE &&
          cursor &&
          scannedMessages < MAX_LOCAL_QUERY_SCAN_MESSAGES
        ) {
          continue;
        }

        const recordsByThread = await Promise.all(
          pendingThreadIds.map((pendingThreadId) =>
            byThread.getAll([emailAccountId, pendingThreadId]),
          ),
        );
        pendingThreadIds = [];
        for (const threadRecords of recordsByThread) {
          const threadMessages = threadRecords
            .map((record) => record.data)
            .filter((message) => !isIgnoredSender(message.headers.from));
          if (threadMatchesQuery(threadMessages, query)) {
            selectedRecords.push(threadRecords);
            if (selectedRecords.length >= limit + 1) break;
          }
        }
      }
      // Sparse filters should fall back to the server instead of blocking a
      // render while IndexedDB walks and deserializes the whole mailbox.
      if (cursor && selectedRecords.length < limit + 1) {
        await transaction.done;
        return;
      }
      records = selectedRecords.flat();
    }
    const messagesByThread = groupMessagesByThread(
      records
        .map((record) => record.data)
        .filter((message) => !isIgnoredSender(message.headers.from)),
    );
    const matchingThreads = [...messagesByThread.entries()]
      .filter(([, messages]) => threadMatchesQuery(messages, query))
      .sort(
        ([, left], [, right]) =>
          getMessageTimestamp(right.at(-1)) - getMessageTimestamp(left.at(-1)),
      );
    const truncated = matchingThreads.length > limit;
    const selectedThreads = matchingThreads.slice(0, limit);

    const rows = transaction.objectStore("threadRows");
    const threads = await Promise.all(
      selectedThreads.map(async ([threadId, messages]) => {
        const cachedRow = await rows.get([emailAccountId, threadId]);
        return toListThread(threadId, messages, cachedRow?.data);
      }),
    );
    await transaction.done;
    if (!isEmailCacheEpochCurrent(emailAccountId, epoch)) return;

    return {
      after: state.after,
      complete: Boolean(
        state.completedAt && !state.hasMore && isCompleteMailboxQuery(query),
      ),
      syncedAt: state.lastSyncedAt,
      threads,
      truncated,
    };
  } catch {
    return;
  }
}

export async function readCombinedSyncedMailboxThreads({
  accounts,
  query,
  limit = query.limit ?? 50,
}: {
  accounts: CombinedListThread["account"][];
  query: ThreadsQuery;
  limit?: number;
}): Promise<SyncedCombinedMailboxSnapshot | undefined> {
  if (!accounts.length) return;

  const accountSnapshots = await Promise.all(
    accounts.map(async (account) => ({
      account,
      snapshot: await readSyncedMailboxThreads({
        emailAccountId: account.id,
        query,
        limit,
      }),
    })),
  );
  const available = accountSnapshots.filter(
    (
      result,
    ): result is {
      account: CombinedListThread["account"];
      snapshot: SyncedMailboxSnapshot;
    } => result.snapshot !== undefined,
  );
  if (!available.length) return;

  const threads = available
    .flatMap(({ account, snapshot }) =>
      snapshot.threads.map((thread) => ({ ...thread, account })),
    )
    .sort(
      (left, right) => getThreadTimestamp(right) - getThreadTimestamp(left),
    );
  const availableAccountIds = new Set(
    available.map(({ account }) => account.id),
  );

  return {
    accountStates: Object.fromEntries(
      available.map(({ account, snapshot }) => [
        account.id,
        {
          after: snapshot.after,
          complete: snapshot.complete,
          syncedAt: snapshot.syncedAt,
          truncated: snapshot.truncated,
        },
      ]),
    ),
    complete:
      available.length === accounts.length &&
      available.every(({ snapshot }) => snapshot.complete),
    missingAccountIds: accounts
      .map((account) => account.id)
      .filter((accountId) => !availableAccountIds.has(accountId)),
    threads,
    truncated:
      threads.length > limit ||
      available.some(({ snapshot }) => snapshot.truncated),
  };
}

export async function markSyncedMailboxThreadsRead({
  emailAccountId,
  threadIds,
  read,
}: {
  emailAccountId: string;
  threadIds: string[];
  read: boolean;
}) {
  if (!threadIds.length) return;
  const epoch = captureEmailCacheEpoch(emailAccountId);
  const database = await getEmailCacheDatabase();
  if (!database || !isEmailCacheEpochCurrent(emailAccountId, epoch)) return;
  const transaction = database.transaction("mailboxMessages", "readwrite");
  const store = transaction.objectStore("mailboxMessages");
  const index = store.index("byAccountThread");

  const lastAccessedAt = Date.now();
  const uniqueThreadIds = [...new Set(threadIds)];
  for (
    let offset = 0;
    offset < uniqueThreadIds.length;
    offset += INDEXED_DB_BATCH_SIZE
  ) {
    const recordsByThread = await Promise.all(
      uniqueThreadIds
        .slice(offset, offset + INDEXED_DB_BATCH_SIZE)
        .map((threadId) => index.getAll([emailAccountId, threadId])),
    );
    await Promise.all(
      recordsByThread.flatMap((records) =>
        records.map((record) => {
          const currentLabels = record.data.labelIds ?? [];
          const labelIds = read
            ? currentLabels.filter((labelId) => labelId !== "UNREAD")
            : [...new Set([...currentLabels, "UNREAD"])];
          return store.put({
            ...record,
            data: { ...record.data, labelIds },
            lastAccessedAt,
          });
        }),
      ),
    );
  }

  await transaction.done;
  if (!isEmailCacheEpochCurrent(emailAccountId, epoch)) return;
  notifyMailboxStoreChange(emailAccountId);
}

export async function removeSyncedMailboxThreads({
  emailAccountId,
  threadIds,
}: {
  emailAccountId: string;
  threadIds: string[];
}) {
  if (!threadIds.length) return;
  const epoch = captureEmailCacheEpoch(emailAccountId);
  const database = await getEmailCacheDatabase();
  if (!database || !isEmailCacheEpochCurrent(emailAccountId, epoch)) return;
  const transaction = database.transaction("mailboxMessages", "readwrite");
  const store = transaction.objectStore("mailboxMessages");
  const index = store.index("byAccountThread");

  const uniqueThreadIds = [...new Set(threadIds)];
  for (
    let offset = 0;
    offset < uniqueThreadIds.length;
    offset += INDEXED_DB_BATCH_SIZE
  ) {
    const keysByThread = await Promise.all(
      uniqueThreadIds
        .slice(offset, offset + INDEXED_DB_BATCH_SIZE)
        .map((threadId) => index.getAllKeys([emailAccountId, threadId])),
    );
    await Promise.all(
      keysByThread.flatMap((keys) => keys.map((key) => store.delete(key))),
    );
  }

  await transaction.done;
  if (!isEmailCacheEpochCurrent(emailAccountId, epoch)) return;
  notifyMailboxStoreChange(emailAccountId);
}

export function subscribeToMailboxStore(
  listener: (emailAccountId: string) => void,
) {
  mailboxListeners.add(listener);
  return () => mailboxListeners.delete(listener);
}

export function notifyMailboxStoreChange(emailAccountId: string) {
  for (const listener of mailboxListeners) listener(emailAccountId);
}

function toCachedMailboxMessage(
  emailAccountId: string,
  message: ParsedMessage,
  now: number,
): CachedMailboxMessage {
  return {
    emailAccountId,
    messageId: message.id,
    threadId: message.threadId,
    data: message,
    receivedAt: getMessageTimestamp(message, now),
    lastAccessedAt: now,
  };
}

function groupMessagesByThread(messages: ParsedMessage[]) {
  const messagesByThread = new Map<string, ParsedMessage[]>();
  for (const message of messages) {
    const threadMessages = messagesByThread.get(message.threadId) ?? [];
    threadMessages.push(message);
    messagesByThread.set(message.threadId, threadMessages);
  }
  for (const threadMessages of messagesByThread.values()) {
    threadMessages.sort(sortByInternalDate());
  }
  return messagesByThread;
}

function isSupportedMailboxQuery(query: ThreadsQuery) {
  if (
    query.q ||
    query.nextPageToken ||
    query.inboxSection ||
    query.excludeLabelNames?.length
  ) {
    return false;
  }
  if (!query.type || query.type === "inbox" || query.type === "unread") {
    return true;
  }
  return query.type.startsWith("CATEGORY_");
}

function isCompleteMailboxQuery(query: ThreadsQuery) {
  return query.type === "inbox" || query.type === "unread";
}

function isRecentInboxQuery(query: ThreadsQuery) {
  return (
    query.type === "inbox" &&
    !query.fromEmail &&
    !query.folderId &&
    !query.isUnread &&
    !query.labelId &&
    !query.labelIds?.length &&
    !query.after &&
    !query.before
  );
}

function threadMatchesQuery(messages: ParsedMessage[], query: ThreadsQuery) {
  const requiredLabelIds = [
    ...(query.labelIds ?? []),
    ...(query.labelId ? [query.labelId] : []),
    ...(query.type === "inbox" || query.type === "unread" ? ["INBOX"] : []),
    ...(query.type?.startsWith("CATEGORY_") ? [query.type] : []),
  ];
  if (
    requiredLabelIds.length &&
    !messages.some((message) =>
      requiredLabelIds.every((labelId) => message.labelIds?.includes(labelId)),
    )
  ) {
    return false;
  }
  if (
    query.folderId &&
    !messages.some((message) => message.parentFolderId === query.folderId)
  ) {
    return false;
  }
  if (
    (query.isUnread || query.type === "unread") &&
    !messages.some((message) => message.labelIds?.includes("UNREAD"))
  ) {
    return false;
  }

  return messages.some((message) => {
    if (
      query.fromEmail &&
      canonicalizeEmailAddress(message.headers.from) !==
        canonicalizeEmailAddress(query.fromEmail)
    ) {
      return false;
    }
    const timestamp = getMessageTimestamp(message);
    if (query.after && timestamp <= query.after.getTime()) return false;
    if (query.before && timestamp >= query.before.getTime()) return false;
    return true;
  });
}

function toListThread(
  threadId: string,
  messages: ParsedMessage[],
  cachedRow: unknown,
): ThreadListItem {
  const cachedThread = getCachedThread(cachedRow);
  const messagesById = new Map(
    cachedThread?.messages.map((message) => [message.id, message]),
  );
  for (const message of messages) {
    messagesById.set(message.id, toListMessage(message));
  }
  const listMessages = [...messagesById.values()].sort(sortByInternalDate());
  const latest = listMessages.at(-1);
  if (!latest) throw new Error("Synced mailbox thread has no messages");
  return {
    id: threadId,
    messageIds: listMessages.map((message) => message.id),
    snippet: latest.snippet,
    plan: cachedThread?.plan,
    plans: cachedThread?.plans ?? [],
    messages: listMessages,
  };
}

function toListMessage(message: ParsedMessage) {
  return {
    id: message.id,
    threadId: message.threadId,
    snippet: message.snippet,
    subject: message.subject,
    date: message.date,
    internalDate: message.internalDate,
    labelIds: message.labelIds,
    headers: message.headers,
  };
}

function getCachedThread(value: unknown): ThreadListItem | undefined {
  if (!isRecord(value) || !Array.isArray(value.messages)) return;
  return value as ThreadListItem;
}

function getMessageTimestamp(message: ParsedMessage | undefined, fallback = 0) {
  const internalTimestamp = internalDateToDate(message?.internalDate, {
    fallbackToNow: false,
  }).getTime();
  if (Number.isFinite(internalTimestamp)) return internalTimestamp;

  const dateTimestamp = internalDateToDate(message?.date, {
    fallbackToNow: false,
  }).getTime();
  return Number.isFinite(dateTimestamp) ? dateTimestamp : fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
