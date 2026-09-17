import { openDB } from "idb";
import { randomUuid } from "@/utils/uuid";
import type { EmailCacheSchema } from "./database";
import { EMAIL_CACHE_DATABASE_NAME } from "./database-name";
import {
  evaluateLocalMailLogicalAdmission,
  readLocalMailStorageLedger,
} from "./local-mail-storage-ledger";

// The caller holds the device storage lock across observation, write and settlement.
export async function accountSearchIndexWrite<T>({
  readBytes,
  setLimit,
  write,
  availableGrowthBytes,
  logicalLimitBytes,
  enforceLogicalBudget = false,
}: {
  readBytes: () => number;
  setLimit: (bytes: number) => unknown;
  write: () => T | Promise<T>;
  availableGrowthBytes: number;
  logicalLimitBytes: number;
  enforceLogicalBudget?: boolean;
}): Promise<T> {
  const observedBytes = readBytes();
  validateBytes(observedBytes);
  validateBytes(availableGrowthBytes);
  validateBytes(logicalLimitBytes);
  // Open only an existing cache. Worker reads/cleanup must not create an account cache.
  const database = await openDB<EmailCacheSchema>(
    EMAIL_CACHE_DATABASE_NAME,
    undefined,
    {
      upgrade(_database, _old, _version, transaction) {
        transaction.abort();
      },
      blocking() {
        database.close();
      },
    },
  );
  try {
    if (!database.objectStoreNames.contains("localMailStorageLedger"))
      throw new Error("Local mail storage accounting unavailable");
    const prepare = database.transaction(
      ["localMailStorageLedger"],
      "readwrite",
    );
    const ledger = await readLocalMailStorageLedger(prepare);
    // A fresh physical observation supersedes any reservation left by a lost owner.
    ledger.index = { status: "ready", bytes: observedBytes };
    let growth = Math.min(
      availableGrowthBytes,
      Number.MAX_SAFE_INTEGER - observedBytes,
    );
    if (enforceLogicalBudget) {
      growth = evaluateLocalMailLogicalAdmission({
        ledger,
        limitBytes: logicalLimitBytes,
        originRemainingBytes: growth,
      }).remainingBytes;
    }
    const token = randomUuid();
    const epoch = ledger.epoch;
    ledger.index.pending = { token, reservedGrowthBytes: growth };
    await prepare.objectStore("localMailStorageLedger").put(ledger);
    await prepare.done;
    try {
      setLimit(observedBytes + growth);
      return await write();
    } finally {
      // If observation fails, preserve the reservation until the next owner reconciles.
      const actualBytes = readBytes();
      validateBytes(actualBytes);
      const settle = database.transaction(
        ["localMailStorageLedger"],
        "readwrite",
      );
      const current = await settle
        .objectStore("localMailStorageLedger")
        .get("origin");
      if (current?.epoch === epoch && current.index.pending?.token === token) {
        current.index = { status: "ready", bytes: actualBytes };
        await settle.objectStore("localMailStorageLedger").put(current);
      }
      await settle.done;
    }
  } finally {
    database.close();
  }
}

function validateBytes(bytes: number) {
  if (!Number.isSafeInteger(bytes) || bytes < 0)
    throw new Error("Invalid index storage measurement");
}
