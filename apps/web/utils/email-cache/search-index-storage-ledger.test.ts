import "fake-indexeddb/auto";
import { beforeEach, expect, it, vi } from "vitest";
import { clearEmailCache, getEmailCacheDatabase } from "./database";
import { bootstrapLocalMailStorageLedgerBatch } from "./local-mail-storage-ledger-bootstrap";
import { accountSearchIndexWrite } from "./search-index-storage-ledger";

beforeEach(async () => {
  await clearEmailCache();
});

it("persists a reservation before writing and settles measured allocation", async () => {
  const database = (await getEmailCacheDatabase())!;
  let bytes = 100;
  const setLimit = vi.fn();
  await expect(
    accountSearchIndexWrite({
      readBytes: () => bytes,
      setLimit,
      availableGrowthBytes: 200,
      logicalLimitBytes: 1000,
      write: async () => {
        expect(
          (await database.get("localMailStorageLedger", "origin"))?.index,
        ).toMatchObject({
          status: "ready",
          bytes: 100,
          pending: { reservedGrowthBytes: 200 },
        });
        bytes = 250;
        return "written";
      },
    }),
  ).resolves.toBe("written");
  expect(setLimit).toHaveBeenCalledWith(300);
  expect(
    (await database.get("localMailStorageLedger", "origin"))?.index,
  ).toEqual({ status: "ready", bytes: 250 });
});

it("accounts allocation left by a failed write without claiming deleted pages were reclaimed", async () => {
  const database = (await getEmailCacheDatabase())!;
  let bytes = 100;
  await expect(
    accountSearchIndexWrite({
      readBytes: () => bytes,
      setLimit: () => {},
      availableGrowthBytes: 200,
      logicalLimitBytes: 1000,
      write: () => {
        bytes = 180;
        throw new Error("write failed");
      },
    }),
  ).rejects.toThrow("write failed");
  expect(
    (await database.get("localMailStorageLedger", "origin"))?.index,
  ).toEqual({ status: "ready", bytes: 180 });
});

it("retains an unmeasurable reservation until the next owner's actual observation", async () => {
  const database = (await getEmailCacheDatabase())!;
  let lost = false;
  await expect(
    accountSearchIndexWrite({
      readBytes: () => {
        if (lost) throw new Error("worker unavailable");
        return 100;
      },
      setLimit: () => {},
      availableGrowthBytes: 200,
      logicalLimitBytes: 1000,
      write: () => {
        lost = true;
      },
    }),
  ).rejects.toThrow("worker unavailable");
  expect(
    (await database.get("localMailStorageLedger", "origin"))?.index.pending
      ?.reservedGrowthBytes,
  ).toBe(200);
  await accountSearchIndexWrite({
    readBytes: () => 240,
    setLimit: () => {},
    availableGrowthBytes: 0,
    logicalLimitBytes: 1000,
    write: () => true,
  });
  expect(
    (await database.get("localMailStorageLedger", "origin"))?.index,
  ).toEqual({ status: "ready", bytes: 240 });
});

it("does not restore accounting after concurrent cache clear", async () => {
  const database = (await getEmailCacheDatabase())!;
  await accountSearchIndexWrite({
    readBytes: () => 100,
    setLimit: () => {},
    availableGrowthBytes: 200,
    logicalLimitBytes: 1000,
    write: async () => {
      await database.clear("localMailStorageLedger");
    },
  });
  expect(
    await database.get("localMailStorageLedger", "origin"),
  ).toBeUndefined();
});

it("limits growth by the shared logical envelope even if origin estimates stay unchanged", async () => {
  const database = (await getEmailCacheDatabase())!;
  await database.put("threadRows", {
    emailAccountId: "account",
    threadId: "thread",
    data: {},
    fetchedAt: 1,
    lastAccessedAt: 1,
  });
  while ((await bootstrapLocalMailStorageLedgerBatch()) === "progress") {}
  const ledger = (await database.get("localMailStorageLedger", "origin"))!;
  const otherBytes = Object.values(ledger.stores).reduce(
    (sum, store) => sum + store.bytes,
    0,
  );
  const setLimit = vi.fn();
  await accountSearchIndexWrite({
    readBytes: () => 100,
    setLimit,
    availableGrowthBytes: 500,
    logicalLimitBytes: otherBytes + 150,
    enforceLogicalBudget: true,
    write: () => {},
  });
  expect(setLimit).toHaveBeenCalledWith(150);
  await accountSearchIndexWrite({
    readBytes: () => 150,
    setLimit,
    availableGrowthBytes: 500,
    logicalLimitBytes: otherBytes + 150,
    enforceLogicalBudget: true,
    write: () => {},
  });
  expect(setLimit).toHaveBeenLastCalledWith(150);
});

it("allows bounded growth until logical bootstrap completes", async () => {
  const setLimit = vi.fn();
  await accountSearchIndexWrite({
    readBytes: () => 100,
    setLimit,
    availableGrowthBytes: 500,
    logicalLimitBytes: 1000,
    enforceLogicalBudget: true,
    write: () => {},
  });
  // Nothing has measured the stores yet, so only physical headroom applies.
  // Refusing growth here stalls indexing until the scan finishes.
  expect(setLimit).toHaveBeenCalledWith(600);
});
