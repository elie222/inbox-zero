import { randomUuid } from "@/utils/uuid";
import {
  captureEmailCacheEpoch,
  getEmailCacheDatabase,
  isEmailCacheEpochCurrent,
} from "./database";
import { isMailSyncActivated } from "./mail-activation";
import { markSearchThreadsDirty } from "./search-index-work";

export async function initializeSearchIndexAccount(emailAccountId: string) {
  if (!isMailSyncActivated(emailAccountId)) return;
  const epoch = captureEmailCacheEpoch(emailAccountId);
  const database = await getEmailCacheDatabase();
  if (!database || !isEmailCacheEpochCurrent(emailAccountId, epoch)) return;
  const transaction = database.transaction("searchIndexAccounts", "readwrite");
  const existing = await transaction.store.get(emailAccountId);
  if (
    !isMailSyncActivated(emailAccountId) ||
    !isEmailCacheEpochCurrent(emailAccountId, epoch)
  ) {
    await transaction.done;
    return;
  }
  const account = existing ?? {
    emailAccountId,
    generation: randomUuid(),
    seed: { store: "mailboxMessages" as const },
  };
  if (!existing) await transaction.store.put(account);
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
  const threadIds = new Set<string>();
  let count = 0;
  let after = seed.after;
  while (cursor && count < 100) {
    threadIds.add(cursor.value.threadId);
    after = cursor.primaryKey;
    count += 1;
    cursor = await cursor.continue();
  }
  await markSearchThreadsDirty(transaction, emailAccountId, threadIds);
  const nextStore =
    seed.store === "mailboxMessages" ? "threadRows" : "threadDetails";
  const nextSeed: typeof account.seed | undefined = cursor
    ? { store: seed.store, after }
    : seed.store === "threadDetails"
      ? undefined
      : { store: nextStore };
  await accounts.put({ ...account, seed: nextSeed });
  await transaction.done;
  return { generation: account.generation, complete: nextSeed === undefined };
}
