import { getEmailCacheDatabase } from "./database";
import {
  LOCAL_MAIL_ACCOUNTED_STORES,
  localMailRecordBytes,
  readLocalMailStorageLedger,
} from "./local-mail-storage-ledger";

export async function bootstrapLocalMailStorageLedgerBatch({
  limit = 100,
  maxBytes = 1_048_576,
}: {
  limit?: number;
  maxBytes?: number;
} = {}) {
  if (
    !Number.isSafeInteger(limit) ||
    limit < 1 ||
    limit > 100 ||
    !Number.isSafeInteger(maxBytes) ||
    maxBytes < 1 ||
    maxBytes > 1_048_576
  )
    throw new Error("Invalid storage accounting batch");
  const database = await getEmailCacheDatabase();
  if (!database) return "unavailable";
  // Include the small ledger and the next source store only, keeping each scan bounded.
  const read = database.transaction(["localMailStorageLedger"], "readwrite");
  const initial = await readLocalMailStorageLedger(read);
  await read.done;
  const storeName = LOCAL_MAIL_ACCOUNTED_STORES.find(
    (name) => !initial.stores[name]?.complete,
  );
  if (!storeName)
    return initial.index.status === "ready" ? "ready" : "waiting-index";
  const transaction = database.transaction(
    ["localMailStorageLedger", storeName],
    "readwrite",
  );
  const ledger = await readLocalMailStorageLedger(transaction);
  const checkpoint = ledger.stores[storeName] ?? { bytes: 0, complete: false };
  if (checkpoint.complete) {
    await transaction.done;
    return "progress";
  }
  const source = transaction.objectStore(storeName);
  let cursor = await source.openCursor(
    checkpoint.afterKey === undefined
      ? undefined
      : IDBKeyRange.lowerBound(checkpoint.afterKey, true),
  );
  let count = 0;
  let bytes = 0;
  while (cursor && count < limit) {
    const size = localMailRecordBytes(cursor.value);
    if (count && bytes + size > maxBytes) break;
    checkpoint.bytes += size;
    checkpoint.afterKey = cursor.primaryKey;
    bytes += size;
    count++;
    cursor = await cursor.continue();
  }
  if (!cursor) checkpoint.complete = true;
  ledger.stores[storeName] = checkpoint;
  await transaction.objectStore("localMailStorageLedger").put(ledger);
  await transaction.done;
  return "progress";
}
