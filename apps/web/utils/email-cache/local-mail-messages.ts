import { invalidateLocalMailMessageAttachments } from "./local-mail-attachments";
import type { IDBPTransaction, StoreNames } from "idb";
import type { ParsedMessage } from "@/utils/types";
import type { EmailCacheSchema } from "./database";
import { sanitizeCachedMailMessage } from "./message-content";
import type { SearchMessage } from "./search-query";
import { markSearchThreadsDirty } from "./search-index-work";
import { toCachedMailboxMessage } from "./mailbox-projection";

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
  {
    metadataOnly = false,
    retention,
  }: {
    metadataOnly?: boolean;
    retention?: {
      revision: number;
      purpose: "restore" | "current" | "backfill" | "cache";
    };
  } = {},
) {
  const account = await transaction
    .objectStore("searchIndexAccounts")
    .get(emailAccountId);
  if (!account) return;
  const policy =
    account.retentionRevision === undefined
      ? undefined
      : await transaction
          .objectStore("localMailRetentionPolicies")
          .get(emailAccountId);
  if (
    account.retentionRevision !== undefined &&
    (!policy ||
      policy.generation !== account.generation ||
      retention?.revision !== policy.revision)
  )
    throw new Error("Local mail retention context is stale or missing");
  const markers = policy
    ? transaction.objectStore("localMailEvictedMessages")
    : undefined;
  let evictionMarkerBytes = account.evictionMarkerBytes ?? 0;
  const store = transaction.objectStore("localMailMessages");
  const projection = transaction.objectStoreNames.contains("mailboxMessages")
    ? transaction.objectStore("mailboxMessages")
    : undefined;
  let messageBytes = account.messageBytes ?? 0;
  const changedThreads = new Set<string>();
  for (const message of messages) {
    const key: [string, string] = [emailAccountId, message.id];
    const [tombstone, previous] = await Promise.all([
      transaction.objectStore("localMailTombstones").get(key),
      store.get(key),
    ]);
    if (tombstone && fetchedAt <= tombstone.deletedAt) {
      if (!tombstone.threadId)
        await transaction
          .objectStore("localMailTombstones")
          .put({ ...tombstone, threadId: message.threadId });
      await repairLocalMailProjection(transaction, key, previous);
      continue;
    }
    const marker = await markers?.get(key);
    if (
      marker &&
      (retention?.purpose !== "restore" || fetchedAt <= marker.evictedAt)
    ) {
      await repairLocalMailProjection(transaction, key, previous);
      continue;
    }
    const receivedTimestamp = Number(
      message.internalDate ||
        Date.parse(message.date ?? message.headers.date ?? ""),
    );
    if (
      policy &&
      (retention?.purpose === "backfill" ||
        (retention?.purpose === "cache" && !previous)) &&
      receivedTimestamp < Math.max(policy.requestedAfter, policy.automaticAfter)
    ) {
      await repairLocalMailProjection(transaction, key, previous);
      continue;
    }
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
      ...attachmentPresence(message, previous, fetchedAt),
    };
    const timestamp = data.internalDate || data.date;
    const receivedAt = /^-?\d+$/u.test(timestamp)
      ? Number(timestamp)
      : Date.parse(timestamp);
    const byteSize = new Blob([JSON.stringify(data)]).size;
    messageBytes += byteSize - (previous?.byteSize ?? 0);
    const record = {
      emailAccountId,
      messageId: data.id,
      threadId: data.threadId,
      data,
      fetchedAt: Math.max(fetchedAt, previous?.fetchedAt ?? fetchedAt),
      bodyFetchedAt: useBody ? fetchedAt : previous?.bodyFetchedAt,
      receivedAt: Number.isFinite(receivedAt) ? receivedAt : 0,
      lastAccessedAt: Date.now(),
      byteSize,
    };
    if (
      previous &&
      (previous.data.attachments?.length || previous.data.inline.length)
    )
      await invalidateLocalMailMessageAttachments(
        transaction,
        emailAccountId,
        message.id,
        record,
      );
    await store.put(record);
    if (projection)
      await projection.put(
        toCachedMailboxMessage(
          emailAccountId,
          data,
          Math.max(fetchedAt, previous?.fetchedAt ?? fetchedAt),
          Number.isFinite(receivedAt) ? receivedAt : 0,
        ),
      );
    if (marker && markers) {
      await markers.delete(key);
      evictionMarkerBytes -= marker.byteSize;
    }
    if (previous) changedThreads.add(previous.threadId);
    changedThreads.add(data.threadId);
  }
  await transaction.objectStore("searchIndexAccounts").put({
    ...((await transaction
      .objectStore("searchIndexAccounts")
      .get(emailAccountId)) ?? account),
    messageBytes,
    ...(policy ? { evictionMarkerBytes } : {}),
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
  const markers =
    account.retentionRevision === undefined
      ? undefined
      : transaction.objectStore("localMailEvictedMessages");
  let evictionMarkerBytes = account.evictionMarkerBytes ?? 0;
  const messages = transaction.objectStore("localMailMessages");
  const tombstones = transaction.objectStore("localMailTombstones");
  const projection = transaction.objectStoreNames.contains("mailboxMessages")
    ? transaction.objectStore("mailboxMessages")
    : undefined;
  const changedThreads = new Set<string>();
  for (const messageId of messageIds) {
    const key: [string, string] = [emailAccountId, messageId];
    const previous = await messages.get(key);
    const tombstone = await tombstones.get(key);
    const marker = await markers?.get(key);
    if (marker && markers && marker.evictedAt <= deletedAt) {
      await markers.delete(key);
      evictionMarkerBytes -= marker.byteSize;
    }
    if (previous && previous.fetchedAt <= deletedAt) {
      await messages.delete(key);
      messageBytes -= previous.byteSize;
      changedThreads.add(previous.threadId);
    }
    await tombstones.put({
      emailAccountId,
      messageId,
      deletedAt: Math.max(deletedAt, tombstone?.deletedAt ?? deletedAt),
      threadId: previous?.threadId ?? marker?.threadId ?? tombstone?.threadId,
    });
    if (!previous || previous.fetchedAt <= deletedAt)
      await invalidateLocalMailMessageAttachments(
        transaction,
        emailAccountId,
        messageId,
      );
    if (projection) {
      if (previous && previous.fetchedAt > deletedAt)
        await projection.put(
          toCachedMailboxMessage(
            emailAccountId,
            previous.data,
            previous.fetchedAt,
            previous.receivedAt,
          ),
        );
      else await projection.delete(key);
    }
  }
  await transaction.objectStore("searchIndexAccounts").put({
    ...((await transaction
      .objectStore("searchIndexAccounts")
      .get(emailAccountId)) ?? account),
    messageBytes,
    ...(markers ? { evictionMarkerBytes } : {}),
  });
  await markSearchThreadsDirty(transaction, emailAccountId, changedThreads);
}

export async function evictLocalMailMessage(
  transaction: WriteTransaction,
  row: EmailCacheSchema["localMailMessages"]["value"],
  revision: number,
  evictedAt: number,
  protection: { recentAfter: number; fetchedAfter: number },
) {
  const account = await transaction
    .objectStore("searchIndexAccounts")
    .get(row.emailAccountId);
  const policy = await transaction
    .objectStore("localMailRetentionPolicies")
    .get(row.emailAccountId);
  if (
    !account ||
    policy?.generation !== account.generation ||
    policy?.revision !== revision
  )
    throw new Error("Local mail eviction context is stale");
  const threadKey: [string, string] = [row.emailAccountId, row.threadId];
  const protectedThread = await transaction
    .objectStore("localMailThreadProtection")
    .get(threadKey);
  if (
    row.receivedAt >= protection.recentAfter ||
    row.fetchedAt >= protection.fetchedAfter ||
    (protectedThread?.generation === account.generation &&
      (Object.values(protectedThread.reservations ?? {}).some(
        (reservation) =>
          reservation.bytes > 0 && reservation.expiresAt > evictedAt,
      ) ||
        (protectedThread.recentlyOpenedUntil ?? 0) > evictedAt))
  )
    return false;
  let mutation = await transaction
    .objectStore("mailMutations")
    .index("byAccountThread")
    .openCursor(threadKey);
  while (mutation) {
    if (mutation.value.status !== "succeeded") return false;
    mutation = await mutation.continue();
  }
  let draft = await transaction
    .objectStore("replyDrafts")
    .index("byAccountThread")
    .openCursor(threadKey);
  while (draft) {
    if (draft.value.content !== null) return false;
    draft = await draft.continue();
  }
  const key: [string, string] = [row.emailAccountId, row.messageId];
  const previous = await transaction.objectStore("localMailMessages").get(key);
  if (
    !previous ||
    previous.fetchedAt !== row.fetchedAt ||
    previous.byteSize !== row.byteSize
  )
    throw new Error("Local mail changed before eviction");
  const markers = transaction.objectStore("localMailEvictedMessages");
  const oldMarker = await markers.get(key);
  const marker = {
    emailAccountId: row.emailAccountId,
    messageId: row.messageId,
    threadId: row.threadId,
    receivedAt: row.receivedAt,
    evictedAt,
    revision,
  };
  let byteSize = 0;
  for (;;) {
    const measured = new Blob([JSON.stringify({ ...marker, byteSize })]).size;
    if (measured === byteSize) break;
    byteSize = measured;
  }
  await markers.put({ ...marker, byteSize });
  await invalidateLocalMailMessageAttachments(
    transaction,
    row.emailAccountId,
    row.messageId,
  );
  await transaction.objectStore("localMailMessages").delete(key);
  await transaction.objectStore("mailboxMessages").delete(key);
  await transaction.objectStore("threadRows").delete(threadKey);
  await transaction
    .objectStore("threadDetails")
    .delete(
      IDBKeyRange.bound(
        [row.emailAccountId, row.threadId, ""],
        [row.emailAccountId, row.threadId, []],
      ),
    );
  await transaction.objectStore("searchIndexAccounts").put({
    ...((await transaction
      .objectStore("searchIndexAccounts")
      .get(row.emailAccountId)) ?? account),
    messageBytes: (account.messageBytes ?? 0) - row.byteSize,
    evictionMarkerBytes:
      (account.evictionMarkerBytes ?? 0) +
      byteSize -
      (oldMarker?.byteSize ?? 0),
  });
  await markSearchThreadsDirty(transaction, row.emailAccountId, [row.threadId]);
  return true;
}

function attachmentPresence(
  message: { hasAttachment?: boolean },
  previous:
    | { fetchedAt: number; data: { hasAttachment?: boolean } }
    | undefined,
  fetchedAt: number,
): { hasAttachment?: boolean } {
  // An older write must not replace a flag already stored by a newer snapshot.
  if (previous && previous.fetchedAt > fetchedAt) return {};
  if (message.hasAttachment !== undefined)
    return { hasAttachment: message.hasAttachment };
  if (previous?.data.hasAttachment !== undefined)
    return { hasAttachment: previous.data.hasAttachment };
  return {};
}

async function repairLocalMailProjection(
  transaction: WriteTransaction,
  key: [string, string],
  previous: EmailCacheSchema["localMailMessages"]["value"] | undefined,
) {
  if (!transaction.objectStoreNames.contains("mailboxMessages")) return;
  const projection = transaction.objectStore("mailboxMessages");
  if (previous)
    await projection.put(
      toCachedMailboxMessage(
        key[0],
        previous.data,
        previous.fetchedAt,
        previous.receivedAt,
      ),
    );
  else await projection.delete(key);
}
