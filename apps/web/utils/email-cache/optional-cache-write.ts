import {
  applyLocalMailStorageDelta,
  evaluateLocalMailLogicalAdmission,
  localMailLedgerBytes,
  localMailRecordBytes,
  readLocalMailStorageLedger,
} from "./local-mail-storage-ledger";
import type {
  IDBPDatabase,
  IDBPObjectStore,
  IDBPTransaction,
  StoreNames,
} from "idb";
import type { EmailCacheSchema } from "./database";
import { readLocalMailSettings } from "./local-mail-settings";

type Store = StoreNames<EmailCacheSchema>;
type Transaction = IDBPTransaction<EmailCacheSchema, Store[], "readwrite">;
type ObjectStore = IDBPObjectStore<
  EmailCacheSchema,
  Store[],
  Store,
  "readwrite"
>;

export class LocalMailStorageCapacityError extends Error {}

export async function withOptionalMailCacheWrite<T>(
  database: IDBPDatabase<EmailCacheSchema>,
  stores: Store[],
  write: (transaction: Transaction) => Promise<T>,
  purpose: "current" | "backfill" = "current",
) {
  const transaction = database.transaction(
    [...new Set<Store>([...stores, "localMailStorageLedger"])],
    "readwrite",
  );
  transaction.done.catch(() => undefined);
  const measured = await meterLocalMailStorageTransaction(transaction, {
    maxGrowthBytes: Number.POSITIVE_INFINITY,
    logicalLimitBytes: localMailCacheLimitBytes(purpose),
    enforceLogicalBudget: true,
  });
  try {
    const result = await write(measured);
    await transaction.done;
    return result;
  } catch (error) {
    try {
      transaction.abort();
    } catch {}
    await transaction.done.catch(() => undefined);
    // A full cache degrades to serving mail online rather than failing the read.
    if (error instanceof LocalMailStorageCapacityError) return;
    throw error;
  }
}

// Backfill stops before the budget is spent so the mail being read keeps room.
function localMailCacheLimitBytes(purpose: "current" | "backfill") {
  const { budgetBytes } = readLocalMailSettings();
  return purpose === "backfill" ? Math.floor(budgetBytes * 0.9) : budgetBytes;
}

// Protected user work and metadata maintenance account bytes without rejecting growth.
export function createAccountedMailTransaction(
  database: IDBPDatabase<EmailCacheSchema>,
  stores: Store | readonly Store[],
) {
  const names = typeof stores === "string" ? [stores] : stores;
  const transaction = database.transaction(
    [...new Set<Store>([...names, "localMailStorageLedger"])],
    "readwrite",
  );
  return meterLocalMailStorageTransaction(transaction, {
    maxGrowthBytes: Number.POSITIVE_INFINITY,
    logicalLimitBytes: Number.POSITIVE_INFINITY,
  });
}

export async function meterLocalMailStorageTransaction(
  transaction: Transaction,
  {
    maxGrowthBytes,
    logicalLimitBytes,
    enforceLogicalBudget = false,
  }: {
    maxGrowthBytes: number;
    logicalLimitBytes: number;
    enforceLogicalBudget?: boolean;
  },
) {
  transaction.done.catch(() => undefined);
  let growth = 0;
  let writes = Promise.resolve();
  const enqueue = <R>(operation: () => Promise<R>) => {
    const result = writes.then(operation);
    writes = result.then(() => undefined);
    writes.catch(() => undefined);
    return result;
  };
  const ledger = await readLocalMailStorageLedger(transaction);
  const initialLogicalBytes = localMailLedgerBytes(ledger);
  const charge = async (
    store: ObjectStore,
    key: IDBValidKey,
    before: unknown,
    after: unknown,
  ) => {
    const delta = localMailRecordBytes(after) - localMailRecordBytes(before);
    const next = growth + delta;
    if (
      next > maxGrowthBytes ||
      (enforceLogicalBudget &&
        delta > 0 &&
        !evaluateLocalMailLogicalAdmission({
          ledger,
          limitBytes: Math.max(initialLogicalBytes, logicalLimitBytes),
          expectedGrowthBytes: delta,
        }).allowed)
    ) {
      transaction.abort();
      throw new LocalMailStorageCapacityError(
        "Optional mail cache capacity exhausted",
      );
    }
    growth = next;
    applyLocalMailStorageDelta(ledger, store.name, key, delta);
    await transaction.objectStore("localMailStorageLedger").put(ledger);
  };
  const wrapCursor = (
    cursor: object | null,
    store: ObjectStore,
  ): object | null => {
    if (!cursor) return null;
    return new Proxy(cursor, {
      get(target, property) {
        if (property === "delete" || property === "update")
          return (input?: unknown) => {
            const value = structuredClone(input);
            return enqueue(async () => {
              const key = Reflect.get(target, "primaryKey");
              const before = await store.get(key);
              await charge(
                store,
                key,
                before,
                property === "delete" ? undefined : value,
              );
              return Reflect.get(target, property).call(target, value);
            });
          };
        if (
          ["continue", "continuePrimaryKey", "advance"].includes(
            String(property),
          )
        )
          return (...args: unknown[]) =>
            enqueue(async () =>
              wrapCursor(
                await Reflect.get(target, property).apply(target, args),
                store,
              ),
            );
        return boundProperty(target, property);
      },
    });
  };
  const wrapSource = (source: object, store: ObjectStore): object =>
    new Proxy(source, {
      get(target, property) {
        if (property === "index")
          return (name: string) =>
            wrapSource(store.index(name as never), store);
        if (property === "openCursor" || property === "openKeyCursor")
          return (...args: unknown[]) =>
            enqueue(async () =>
              wrapCursor(
                await Reflect.get(target, property).apply(target, args),
                store,
              ),
            );
        if (
          ["get", "getKey", "getAll", "getAllKeys", "count"].includes(
            String(property),
          )
        )
          return (...args: unknown[]) =>
            enqueue(() => Reflect.get(target, property).apply(target, args));
        if (property === "put" || property === "add")
          return (input: unknown, explicitKey?: IDBValidKey) => {
            const value = structuredClone(input);
            return enqueue(async () => {
              const key = explicitKey ?? recordKey(value, store.keyPath);
              const before = await store.get(key as never);
              await charge(store, key as IDBValidKey, before, value);
              return Reflect.get(target, property).call(
                target,
                value,
                explicitKey,
              );
            });
          };
        if (property === "delete" || property === "clear")
          return (key?: IDBValidKey | IDBKeyRange) =>
            enqueue(async () => {
              if (property === "clear") {
                // Counted bytes make whole-store cleanup independent of mailbox size.
                growth -= ledger.stores[store.name]?.bytes ?? 0;
                ledger.stores[store.name] = { bytes: 0, complete: true };
                await transaction
                  .objectStore("localMailStorageLedger")
                  .put(ledger);
              } else if (key instanceof IDBKeyRange) {
                let cursor = await store.openCursor(key as never);
                while (cursor) {
                  await charge(
                    store,
                    cursor.primaryKey,
                    cursor.value,
                    undefined,
                  );
                  cursor = await cursor.continue();
                }
              } else
                await charge(
                  store,
                  key as IDBValidKey,
                  await store.get(key as never),
                  undefined,
                );
              return Reflect.get(target, property).call(target, key);
            });
        return boundProperty(target, property);
      },
    });
  const measured = new Proxy(transaction, {
    get(target, property) {
      if (property === "store") {
        const store = Reflect.get(target, property, target) as
          | ObjectStore
          | undefined;
        return store ? wrapSource(store, store) : undefined;
      }
      if (property === "objectStore")
        return (name: Store) => {
          const store = target.objectStore(name);
          return name === "localMailStorageLedger"
            ? store
            : wrapSource(store, store);
        };
      return boundProperty(target, property);
    },
  });
  return measured;
}

function recordKey(value: unknown, keyPath: string | string[] | null) {
  // Every store in this schema declares a key path, so a missing one means the
  // write cannot be charged to the right record rather than that it is unkeyed.
  if (keyPath === null)
    throw new Error("An accounted write needs a key path or an explicit key");
  const read = (path: string) =>
    path
      .split(".")
      .reduce<unknown>(
        (entry, part) => (entry as Record<string, unknown>)[part],
        value,
      );
  return Array.isArray(keyPath) ? keyPath.map(read) : read(keyPath);
}
function boundProperty(target: object, property: string | symbol) {
  const value = Reflect.get(target, property, target);
  return typeof value === "function" ? value.bind(target) : value;
}
