import type { IDBPTransaction, StoreNames } from "idb";
import type { ParsedMessage } from "@/utils/types";
import type { EmailCacheSchema } from "./database";
import { sanitizeCachedMailMessage } from "./message-content";
import type { SearchMessage } from "./search-query";
import { markSearchThreadsDirty } from "./search-index-work";

type WriteTransaction = IDBPTransaction<
  EmailCacheSchema,
  StoreNames<EmailCacheSchema>[],
  "readwrite"
>;

export async function storeLocalMailMessages(
  transaction: WriteTransaction,
  emailAccountId: string,
  messages: (SearchMessage & Partial<ParsedMessage>)[],
  fetchedAt: number,
  { metadataOnly = false }: { metadataOnly?: boolean } = {},
) {
  const account = await transaction
    .objectStore("searchIndexAccounts")
    .get(emailAccountId);
  if (!account) return;
  const store = transaction.objectStore("localMailMessages");
  let messageBytes = account.messageBytes ?? 0;
  const changedThreads = new Set<string>();
  for (const message of messages) {
    const key: [string, string] = [emailAccountId, message.id];
    const tombstone = await transaction
      .objectStore("localMailTombstones")
      .get(key);
    if (tombstone && fetchedAt <= tombstone.deletedAt) continue;
    const previous = await store.get(key);
    const incoming = sanitizeCachedMailMessage({
      ...message,
      date: message.date ?? message.headers.date ?? "",
      historyId: message.historyId ?? "",
      inline: message.inline ?? [],
    });
    const metadata =
      previous && previous.fetchedAt > fetchedAt ? previous.data : incoming;
    const hasBody =
      !metadataOnly &&
      (incoming.textPlain !== undefined || incoming.textHtml !== undefined);
    const useBody =
      hasBody &&
      (previous?.bodyFetchedAt === undefined ||
        fetchedAt >= previous.bodyFetchedAt);
    const body = useBody ? incoming : previous?.data;
    const data = {
      ...metadata,
      textPlain: body?.textPlain,
      textHtml: body?.textHtml,
      bodyContentType: body?.bodyContentType,
      inline: body?.inline ?? metadata.inline,
      attachments: metadata.attachments ?? previous?.data.attachments,
    };
    const timestamp = data.internalDate || data.date;
    const receivedAt = /^-?\d+$/u.test(timestamp)
      ? Number(timestamp)
      : Date.parse(timestamp);
    const byteSize = new Blob([JSON.stringify(data)]).size;
    messageBytes += byteSize - (previous?.byteSize ?? 0);
    await store.put({
      emailAccountId,
      messageId: data.id,
      threadId: data.threadId,
      data,
      fetchedAt: Math.max(fetchedAt, previous?.fetchedAt ?? fetchedAt),
      bodyFetchedAt: useBody ? fetchedAt : previous?.bodyFetchedAt,
      receivedAt: Number.isFinite(receivedAt) ? receivedAt : 0,
      lastAccessedAt: Date.now(),
      byteSize,
    });
    if (previous) changedThreads.add(previous.threadId);
    changedThreads.add(data.threadId);
  }
  await transaction.objectStore("searchIndexAccounts").put({
    ...account,
    messageBytes,
  });
  await markSearchThreadsDirty(transaction, emailAccountId, changedThreads);
}

export async function deleteLocalMailMessages(
  transaction: WriteTransaction,
  emailAccountId: string,
  messageIds: Iterable<string>,
  deletedAt: number,
) {
  const account = await transaction
    .objectStore("searchIndexAccounts")
    .get(emailAccountId);
  if (!account) return;
  let messageBytes = account.messageBytes ?? 0;
  const messages = transaction.objectStore("localMailMessages");
  const tombstones = transaction.objectStore("localMailTombstones");
  const changedThreads = new Set<string>();
  for (const messageId of messageIds) {
    const key: [string, string] = [emailAccountId, messageId];
    const previous = await messages.get(key);
    const tombstone = await tombstones.get(key);
    await tombstones.put({
      emailAccountId,
      messageId,
      deletedAt: Math.max(deletedAt, tombstone?.deletedAt ?? deletedAt),
    });
    if (previous && previous.fetchedAt <= deletedAt) {
      await messages.delete(key);
      messageBytes -= previous.byteSize;
      changedThreads.add(previous.threadId);
    }
  }
  await transaction.objectStore("searchIndexAccounts").put({
    ...account,
    messageBytes,
  });
  await markSearchThreadsDirty(transaction, emailAccountId, changedThreads);
}
