import { createAccountedMailTransaction } from "./optional-cache-write";
import type { IDBPTransaction, StoreNames } from "idb";
import type { ParsedMessage } from "@/utils/types";
import {
  captureEmailCacheEpoch,
  getEmailCacheDatabase,
  isEmailCacheEpochCurrent,
  type EmailCacheSchema,
} from "./database";
import {
  canReadPersistedThread,
  getThreadCacheVersion,
} from "./thread-invalidation";

export async function readLocalMailThreadPage({
  emailAccountId,
  threadId,
  includeDrafts = false,
  before,
  generation,
  protectWhileOpen = false,
}: {
  emailAccountId: string;
  threadId: string;
  includeDrafts?: boolean;
  before?: { receivedAt: number; messageId: string };
  generation?: string;
  protectWhileOpen?: boolean;
}) {
  if (!canReadPersistedThread(emailAccountId, threadId)) return;
  const epoch = captureEmailCacheEpoch(emailAccountId);
  const version = getThreadCacheVersion(emailAccountId, threadId);
  try {
    const database = await getEmailCacheDatabase();
    if (!database || !isEmailCacheEpochCurrent(emailAccountId, epoch)) return;
    const transaction = await createAccountedMailTransaction(database, [
      "searchIndexAccounts",
      "localMailMessages",
      "localMailTombstones",
      "localMailEvictedMessages",
      "localMailThreadProtection",
    ]);
    const account = await transaction
      .objectStore("searchIndexAccounts")
      .get(emailAccountId);
    if (!account || (generation && generation !== account.generation)) {
      await transaction.done;
      return;
    }
    if (protectWhileOpen)
      await protectOpenThread(
        transaction,
        emailAccountId,
        threadId,
        account.generation,
      );
    const range = IDBKeyRange.bound(
      [emailAccountId, threadId, Number.NEGATIVE_INFINITY, ""],
      before
        ? [emailAccountId, threadId, before.receivedAt, before.messageId]
        : [emailAccountId, threadId, []],
      false,
      before !== undefined,
    );
    const deletedMessage = await transaction
      .objectStore("localMailTombstones")
      .index("byAccountThread")
      .getKey([emailAccountId, threadId]);
    const evictedMessage = await transaction
      .objectStore("localMailEvictedMessages")
      .index("byAccountThread")
      .getKey([emailAccountId, threadId]);
    let cursor = await transaction
      .objectStore("localMailMessages")
      .index("byAccountThreadReceivedAt")
      .openCursor(range, "prev");
    const messages: {
      message: ParsedMessage;
      bodyAvailable: boolean;
      fetchedAt: number;
    }[] = [];
    let bytes = 0;
    let scanned = 0;
    let lastPosition = before;
    while (cursor && scanned < 100 && messages.length < 30) {
      const record = cursor.value;
      const excluded =
        !includeDrafts && record.data.labelIds?.includes("DRAFT");
      if (!excluded) {
        // Allow one oversized message so a large body cannot stall pagination.
        if (messages.length && bytes + record.byteSize > 4 * 1024 * 1024) break;
        messages.push({
          message: record.data,
          bodyAvailable: record.bodyFetchedAt !== undefined,
          fetchedAt: record.fetchedAt,
        });
        bytes += record.byteSize;
      }
      lastPosition = {
        receivedAt: record.receivedAt,
        messageId: record.messageId,
      };
      scanned++;
      cursor = await cursor.continue();
    }
    const next = cursor ? lastPosition : undefined;
    await transaction.done;
    const currentAccount = await database.get(
      "searchIndexAccounts",
      emailAccountId,
    );
    if (
      currentAccount?.generation !== account.generation ||
      !isEmailCacheEpochCurrent(emailAccountId, epoch) ||
      !canReadPersistedThread(emailAccountId, threadId) ||
      version !== getThreadCacheVersion(emailAccountId, threadId)
    )
      return;
    // Exhausting local rows says nothing about messages not yet downloaded.
    return {
      messages: messages.reverse(),
      next,
      generation: account.generation,
      hasRetainedThread:
        scanned > 0 ||
        deletedMessage !== undefined ||
        evictedMessage !== undefined,
    };
  } catch {
    return;
  }
}

export function keepLocalMailThreadOpen({
  emailAccountId,
  threadId,
  generation,
}: {
  emailAccountId: string;
  threadId: string;
  generation: string;
}) {
  const epoch = captureEmailCacheEpoch(emailAccountId);
  let stopped = false;
  const timer = setInterval(() => {
    renew().catch(() => undefined);
  }, 60_000);
  return () => {
    stopped = true;
    clearInterval(timer);
  };

  async function renew() {
    const database = await getEmailCacheDatabase();
    if (
      !database ||
      stopped ||
      !isEmailCacheEpochCurrent(emailAccountId, epoch)
    )
      return;
    const transaction = await createAccountedMailTransaction(database, [
      "searchIndexAccounts",
      "localMailThreadProtection",
    ]);
    const account = await transaction
      .objectStore("searchIndexAccounts")
      .get(emailAccountId);
    if (
      stopped ||
      !isEmailCacheEpochCurrent(emailAccountId, epoch) ||
      account?.generation !== generation
    ) {
      await transaction.done;
      return;
    }
    await protectOpenThread(transaction, emailAccountId, threadId, generation);
    if (stopped || !isEmailCacheEpochCurrent(emailAccountId, epoch)) {
      transaction.abort();
      await transaction.done.catch(() => undefined);
      return;
    }
    await transaction.done;
  }
}

async function protectOpenThread(
  transaction: IDBPTransaction<
    EmailCacheSchema,
    StoreNames<EmailCacheSchema>[],
    "readwrite"
  >,
  emailAccountId: string,
  threadId: string,
  generation: string,
) {
  const store = transaction.objectStore("localMailThreadProtection");
  const previous = await store.get([emailAccountId, threadId]);
  const current = previous?.generation === generation ? previous : undefined;
  const now = Date.now();
  if ((current?.recentlyOpenedUntil ?? 0) > now + 4 * 60_000) return;
  await store.put({
    ...current,
    emailAccountId,
    threadId,
    generation,
    recentlyOpenedUntil: now + 5 * 60_000,
  });
}
