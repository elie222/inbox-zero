import { randomUuid } from "@/utils/uuid";
import type { IDBPTransaction, StoreNames } from "idb";
import { getEmailCacheDatabase, type EmailCacheSchema } from "./database";

type SearchIndexWorkItem = EmailCacheSchema["searchIndexWork"]["value"];
type IndexTransaction = IDBPTransaction<
  EmailCacheSchema,
  StoreNames<EmailCacheSchema>[],
  "readwrite"
>;

// Call inside the source write transaction, so a crash cannot lose index work.
export async function markSearchThreadsDirty(
  transaction: IndexTransaction,
  emailAccountId: string,
  threadIds: Iterable<string>,
) {
  const account = await transaction
    .objectStore("searchIndexAccounts")
    .get(emailAccountId);
  if (!account) return;
  const workStore = transaction.objectStore("searchIndexWork");
  await Promise.all(
    [...new Set(threadIds)].map((threadId) =>
      workStore.put({
        emailAccountId,
        threadId,
        token: randomUuid(),
        status: "pending",
      }),
    ),
  );
}

export async function readSearchIndexWork(emailAccountId: string) {
  const database = await getEmailCacheDatabase();
  if (!database) return;
  const transaction = database.transaction(
    ["searchIndexAccounts", "searchIndexWork"],
    "readonly",
  );
  const [account, work, blockedCount] = await Promise.all([
    transaction.objectStore("searchIndexAccounts").get(emailAccountId),
    transaction
      .objectStore("searchIndexWork")
      .index("byAccountStatus")
      .getAll([emailAccountId, "pending"], 100),
    transaction
      .objectStore("searchIndexWork")
      .index("byAccountStatus")
      .count([emailAccountId, "blocked"]),
  ]);
  await transaction.done;
  if (!account) return;
  return { generation: account.generation, work, blockedCount };
}

export async function acknowledgeSearchIndexWork({
  emailAccountId,
  generation,
  work,
}: {
  emailAccountId: string;
  generation: string;
  work: SearchIndexWorkItem[];
}) {
  const database = await getEmailCacheDatabase();
  if (!database) return false;
  const transaction = database.transaction(
    ["searchIndexAccounts", "searchIndexWork"],
    "readwrite",
  );
  const account = await transaction
    .objectStore("searchIndexAccounts")
    .get(emailAccountId);
  if (account?.generation !== generation) {
    await transaction.done;
    return false;
  }
  const store = transaction.objectStore("searchIndexWork");
  await Promise.all(
    work.map(async (item) => {
      if (item.emailAccountId !== emailAccountId) return;
      const key: [string, string] = [emailAccountId, item.threadId];
      const current = await store.get(key);
      if (current?.token === item.token) await store.delete(key);
    }),
  );
  await transaction.done;
  return true;
}

export async function advanceSearchIndexWork({
  emailAccountId,
  generation,
  threadId,
  token,
  afterMessageId,
}: {
  emailAccountId: string;
  generation: string;
  threadId: string;
  token: string;
  afterMessageId: string;
}) {
  const database = await getEmailCacheDatabase();
  if (!database) return false;
  const transaction = database.transaction(
    ["searchIndexAccounts", "searchIndexWork"],
    "readwrite",
  );
  const [account, item] = await Promise.all([
    transaction.objectStore("searchIndexAccounts").get(emailAccountId),
    transaction.objectStore("searchIndexWork").get([emailAccountId, threadId]),
  ]);
  if (account?.generation !== generation || item?.token !== token) {
    await transaction.done;
    return false;
  }
  await transaction
    .objectStore("searchIndexWork")
    .put({ ...item, afterMessageId });
  await transaction.done;
  return true;
}

export async function blockSearchIndexWork({
  emailAccountId,
  generation,
  threadId,
  token,
  errorCode,
}: {
  emailAccountId: string;
  generation: string;
  threadId: string;
  token: string;
  errorCode: string;
}) {
  const database = await getEmailCacheDatabase();
  if (!database) return false;
  const transaction = database.transaction(
    ["searchIndexAccounts", "searchIndexWork"],
    "readwrite",
  );
  const [account, item] = await Promise.all([
    transaction.objectStore("searchIndexAccounts").get(emailAccountId),
    transaction.objectStore("searchIndexWork").get([emailAccountId, threadId]),
  ]);
  if (account?.generation !== generation || item?.token !== token) {
    await transaction.done;
    return false;
  }
  await transaction
    .objectStore("searchIndexWork")
    .put({ ...item, status: "blocked", errorCode });
  await transaction.done;
  return true;
}
