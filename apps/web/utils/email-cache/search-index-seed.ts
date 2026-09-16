import { randomUuid } from "@/utils/uuid";
import {
  captureEmailCacheEpoch,
  getEmailCacheDatabase,
  isEmailCacheEpochCurrent,
} from "./database";
import { isMailSyncActivated } from "./mail-activation";
import { storeLocalMailMessages } from "./local-mail-messages";
import type { SearchMessage } from "./search-query";
import {
  EMAIL_CACHE_MAX_AGE_MS,
  EMAIL_CACHE_MAILBOX_MAX_AGE_MS,
} from "./policy";

export async function initializeSearchIndexAccount(emailAccountId: string) {
  if (!isMailSyncActivated(emailAccountId)) return;
  const epoch = captureEmailCacheEpoch(emailAccountId);
  const database = await getEmailCacheDatabase();
  if (!database || !isEmailCacheEpochCurrent(emailAccountId, epoch)) return;
  const transaction = database.transaction(
    [
      "searchIndexAccounts",
      "searchIndexWork",
      "localMailMessages",
      "localMailTombstones",
    ],
    "readwrite",
  );
  const accounts = transaction.objectStore("searchIndexAccounts");
  const existing = await accounts.get(emailAccountId);
  if (
    !isMailSyncActivated(emailAccountId) ||
    !isEmailCacheEpochCurrent(emailAccountId, epoch)
  ) {
    await transaction.done;
    return;
  }
  const account =
    existing?.sourceVersion === 2
      ? existing
      : {
          emailAccountId,
          generation: randomUuid(),
          sourceVersion: 2,
          messageBytes: 0,
          seed: { store: "mailboxMessages" as const },
        };
  if (account !== existing) {
    const range = IDBKeyRange.bound([emailAccountId, ""], [emailAccountId, []]);
    await Promise.all([
      transaction.objectStore("searchIndexWork").delete(range),
      transaction.objectStore("localMailMessages").delete(range),
      accounts.put(account),
    ]);
  }
  await transaction.done;
  return account;
}

export async function seedSearchIndexWork(emailAccountId: string) {
  if (!isMailSyncActivated(emailAccountId)) return;
  const database = await getEmailCacheDatabase();
  if (!database) return;
  const transaction = database.transaction(
    [
      "searchIndexAccounts",
      "searchIndexWork",
      "localMailMessages",
      "localMailTombstones",
      "mailboxMessages",
      "threadRows",
      "threadDetails",
    ],
    "readwrite",
  );
  const accounts = transaction.objectStore("searchIndexAccounts");
  const account = await accounts.get(emailAccountId);
  if (!account || !isMailSyncActivated(emailAccountId)) {
    await transaction.done;
    return;
  }
  if (!account.seed) {
    await transaction.done;
    return { generation: account.generation, complete: true };
  }
  const seed = account.seed;
  const range = IDBKeyRange.bound(
    seed.after ?? [emailAccountId, ""],
    [emailAccountId, []],
    !!seed.after,
  );
  let cursor = await transaction.objectStore(seed.store).openCursor(range);
  let count = 0;
  let after = seed.after;
  let messageOffset = seed.messageOffset ?? 0;
  while (cursor && count < 100) {
    const record = cursor.value;
    const fetchedAt =
      "fetchedAt" in record ? record.fetchedAt : record.lastAccessedAt;
    const maxAge =
      seed.store === "mailboxMessages"
        ? EMAIL_CACHE_MAILBOX_MAX_AGE_MS
        : EMAIL_CACHE_MAX_AGE_MS;
    const data = record.data as {
      thread?: { messages?: SearchMessage[] };
      messages?: SearchMessage[];
    };
    const messages =
      seed.store === "mailboxMessages"
        ? [record.data as SearchMessage]
        : (data.thread?.messages ?? data.messages ?? []);
    const retained =
      Date.now() - fetchedAt <= maxAge && Array.isArray(messages)
        ? messages
        : [];
    const page = retained.slice(messageOffset, messageOffset + 100 - count);
    await storeLocalMailMessages(transaction, emailAccountId, page, fetchedAt, {
      metadataOnly:
        seed.store === "threadDetails" &&
        !("variant" in record && record.variant.endsWith("|replies:0")),
    });
    count += Math.max(1, page.length);
    messageOffset += page.length;
    if (messageOffset < retained.length) break;
    after = cursor.primaryKey;
    messageOffset = 0;
    cursor = await cursor.continue();
  }
  const nextStore =
    seed.store === "mailboxMessages" ? "threadRows" : "threadDetails";
  const nextSeed: typeof account.seed | undefined = cursor
    ? { store: seed.store, after, messageOffset }
    : seed.store === "threadDetails"
      ? undefined
      : { store: nextStore };
  const updatedAccount = await accounts.get(emailAccountId);
  if (!updatedAccount)
    throw new Error("Missing search index account during seed");
  await accounts.put({ ...updatedAccount, seed: nextSeed });
  await transaction.done;
  return { generation: account.generation, complete: nextSeed === undefined };
}
