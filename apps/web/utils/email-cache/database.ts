import { openDB, type DBSchema, type IDBPDatabase } from "idb";

const DATABASE_NAME = "inbox-zero-email-cache";
const DATABASE_VERSION = 1;

export type CachedThreadRow = {
  emailAccountId: string;
  threadId: string;
  data: unknown;
  fetchedAt: number;
  lastAccessedAt: number;
};

export type CachedThreadView = {
  emailAccountId: string;
  viewKey: string;
  threadIds: string[];
  hasMore: boolean;
  fetchedAt: number;
  lastAccessedAt: number;
};

export type CachedThreadDetail = {
  emailAccountId: string;
  threadId: string;
  variant: string;
  data: unknown;
  fetchedAt: number;
  lastAccessedAt: number;
  byteSize: number;
};

interface EmailCacheSchema extends DBSchema {
  threadDetails: {
    key: [emailAccountId: string, threadId: string, variant: string];
    value: CachedThreadDetail;
    indexes: { byAccount: string; byLastAccessed: number };
  };
  threadRows: {
    key: [emailAccountId: string, threadId: string];
    value: CachedThreadRow;
    indexes: { byAccount: string };
  };
  threadViews: {
    key: [emailAccountId: string, viewKey: string];
    value: CachedThreadView;
    indexes: { byAccount: string; byLastAccessed: number };
  };
}

let databasePromise: Promise<
  IDBPDatabase<EmailCacheSchema> | undefined
> | null = null;

export function getEmailCacheDatabase() {
  if (typeof indexedDB === "undefined") return Promise.resolve(undefined);
  if (databasePromise) return databasePromise;

  databasePromise = openDB<EmailCacheSchema>(DATABASE_NAME, DATABASE_VERSION, {
    upgrade(database) {
      const rows = database.createObjectStore("threadRows", {
        keyPath: ["emailAccountId", "threadId"],
      });
      rows.createIndex("byAccount", "emailAccountId");

      const views = database.createObjectStore("threadViews", {
        keyPath: ["emailAccountId", "viewKey"],
      });
      views.createIndex("byAccount", "emailAccountId");
      views.createIndex("byLastAccessed", "lastAccessedAt");

      const details = database.createObjectStore("threadDetails", {
        keyPath: ["emailAccountId", "threadId", "variant"],
      });
      details.createIndex("byAccount", "emailAccountId");
      details.createIndex("byLastAccessed", "lastAccessedAt");
    },
    blocking() {
      databasePromise?.then((database) => database?.close());
      databasePromise = null;
    },
    terminated() {
      databasePromise = null;
    },
  }).catch<undefined>(() => {
    databasePromise = null;
  });

  return databasePromise;
}

export async function clearEmailCache() {
  try {
    const database = await getEmailCacheDatabase();
    if (!database) return;
    const transaction = database.transaction(
      ["threadRows", "threadViews", "threadDetails"],
      "readwrite",
    );
    await Promise.all([
      transaction.objectStore("threadRows").clear(),
      transaction.objectStore("threadViews").clear(),
      transaction.objectStore("threadDetails").clear(),
      transaction.done,
    ]);
  } catch {
    // Browser storage is a performance enhancement; clearing it must not block logout.
  }
}

export async function clearEmailCacheForAccount(emailAccountId: string) {
  try {
    const database = await getEmailCacheDatabase();
    if (!database) return;
    const transaction = database.transaction(
      ["threadRows", "threadViews", "threadDetails"],
      "readwrite",
    );
    const rows = transaction.objectStore("threadRows");
    const views = transaction.objectStore("threadViews");
    const details = transaction.objectStore("threadDetails");
    const [rowKeys, viewKeys, detailKeys] = await Promise.all([
      rows.index("byAccount").getAllKeys(emailAccountId),
      views.index("byAccount").getAllKeys(emailAccountId),
      details.index("byAccount").getAllKeys(emailAccountId),
    ]);
    await Promise.all([
      ...rowKeys.map((key) => rows.delete(key)),
      ...viewKeys.map((key) => views.delete(key)),
      ...detailKeys.map((key) => details.delete(key)),
    ]);
    await transaction.done;
  } catch {
    // An unavailable cache must never prevent an account from disconnecting.
  }
}
