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
  const [account, work] = await Promise.all([
    transaction.objectStore("searchIndexAccounts").get(emailAccountId),
    transaction
      .objectStore("searchIndexWork")
      .index("byAccount")
      .getAll(emailAccountId, 100),
  ]);
  await transaction.done;
  if (!account) return;
  return { generation: account.generation, work };
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
