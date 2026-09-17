import { bootstrapLocalMailStorageLedgerBatch } from "./local-mail-storage-ledger-bootstrap";
import { getEmailCacheDatabase } from "./database";
import { afterEach, beforeEach, vi } from "vitest";

export function installMailCacheStorageTestEnvironment() {
  beforeEach(() => {
    const held = new Set<string>();
    vi.stubGlobal("navigator", {
      ...globalThis.navigator,
      storage: {
        estimate: vi.fn(async () => {
          await prepareMailCacheLedgerForTest();
          return { usage: 0, quota: 10 * 1024 ** 3 };
        }),
      },
      locks: {
        request: async (
          name: string,
          options: unknown,
          callback?: (lock: unknown) => unknown,
        ) => {
          const run = callback ?? (options as (lock: unknown) => unknown);
          if (held.has(name)) return run(null);
          held.add(name);
          try {
            return await run({ name });
          } finally {
            held.delete(name);
          }
        },
      },
    });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });
}

export async function prepareMailCacheLedgerForTest() {
  while ((await bootstrapLocalMailStorageLedgerBatch()) === "progress") {}
  const database = await getEmailCacheDatabase();
  if (!database) return;
  const tx = database.transaction("localMailStorageLedger", "readwrite");
  const ledger = await tx.store.get("origin");
  if (ledger)
    await tx.store.put({ ...ledger, index: { status: "ready", bytes: 0 } });
  await tx.done;
}
