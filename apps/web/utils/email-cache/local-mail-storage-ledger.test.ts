import { createReplyDraftWriter } from "./reply-drafts";
import {
  enqueueMailMutation,
  cancelPendingMailMutation,
} from "./mail-mutations";
import { clearEmailCacheForAccount } from "./database";
import "fake-indexeddb/auto";
import { bootstrapLocalMailStorageLedgerBatch } from "./local-mail-storage-ledger-bootstrap";
import { beforeEach, expect, it } from "vitest";
import { clearEmailCache, getEmailCacheDatabase } from "./database";
import {
  LOCAL_MAIL_ACCOUNTED_STORES,
  localMailLedgerBytes,
  localMailRecordBytes,
  evaluateLocalMailLogicalAdmission,
  readLocalMailStorageLedger,
} from "./local-mail-storage-ledger";
import {
  LocalMailStorageCapacityError,
  meterLocalMailStorageTransaction,
} from "./optional-cache-write";
import { installMailCacheStorageTestEnvironment } from "./optional-cache-write.test-helpers";
import type { LocalMailStorageLedger } from "./local-mail-storage-ledger-types";

installMailCacheStorageTestEnvironment();
beforeEach(async () => {
  await clearEmailCache();
  await (await getEmailCacheDatabase())!.clear("localMailStorageLedger");
});

it.each([
  { stores: null },
  { index: null },
  { stores: [] },
  { stores: { threadRows: null } },
  { stores: { threadRows: { bytes: -1, complete: true } } },
  { stores: { threadRows: { bytes: 1, complete: false } } },
  { stores: { threadRows: { bytes: 0, complete: false, afterKey: {} } } },
  {
    stores: {
      threadRows: { bytes: 0, complete: false, afterKey: "wrong shape" },
    },
  },
  { stores: { unknown: { bytes: 0, complete: true } } },
  { index: { status: "ready" } },
  { index: { status: "invalid", bytes: 0 } },
  {
    index: {
      status: "ready",
      bytes: 0,
      pending: { token: "", reservedGrowthBytes: 0 },
    },
  },
  {
    index: {
      status: "ready",
      bytes: 0,
      pending: { token: "token", reservedGrowthBytes: Number.NaN },
    },
  },
  {
    stores: { threadRows: { bytes: Number.MAX_SAFE_INTEGER, complete: true } },
    index: { status: "ready", bytes: 1 },
  },
])("recovers malformed ledger without deleting readable source: %j", async (corruption) => {
  const db = (await getEmailCacheDatabase())!;
  await db.put("threadRows", row("a", "retained"));
  await db.put("localMailStorageLedger", {
    ...readyLedger(),
    ...corruption,
  } as LocalMailStorageLedger);
  const tx = db.transaction(["localMailStorageLedger"], "readwrite");
  const repaired = await readLocalMailStorageLedger(tx);
  await tx.done;
  expect(repaired.stores).toEqual({});
  expect(repaired.index).toEqual({ status: "unknown" });
  expect(repaired.epoch).not.toBe("epoch");
  expect(
    evaluateLocalMailLogicalAdmission({
      ledger: repaired,
      limitBytes: 100_000,
      expectedGrowthBytes: 1,
    }).reason,
  ).toBe("ledger-incomplete");
  expect(await db.get("threadRows", ["account", "a"])).toEqual(
    row("a", "retained"),
  );
  while ((await bootstrapLocalMailStorageLedgerBatch()) === "progress") {}
  expect(
    (await db.get("localMailStorageLedger", "origin"))?.stores.threadRows.bytes,
  ).toBe(localMailRecordBytes(row("a", "retained")));
});

it("combines logical reservations and physical headroom without widening a reduced limit", () => {
  const ledger = readyLedger();
  ledger.stores.threadRows.bytes = 40;
  ledger.index = {
    status: "ready",
    bytes: 20,
    pending: { token: "pending", reservedGrowthBytes: 10 },
  };
  expect(
    evaluateLocalMailLogicalAdmission({
      ledger,
      limitBytes: 100,
      reservedGrowthBytes: 5,
      expectedGrowthBytes: 25,
    }),
  ).toMatchObject({ allowed: true, remainingBytes: 25, usedBytes: 70 });
  expect(
    evaluateLocalMailLogicalAdmission({
      ledger,
      limitBytes: 100,
      originRemainingBytes: 8,
      expectedGrowthBytes: 9,
    }),
  ).toMatchObject({ allowed: false, remainingBytes: 8 });
  expect(
    evaluateLocalMailLogicalAdmission({
      ledger,
      limitBytes: 50,
      expectedGrowthBytes: 1,
    }),
  ).toMatchObject({ allowed: false, remainingBytes: 0 });
});

it("bootstraps bounded prefixes and accounts live inserts/updates/deletes on either side exactly once", async () => {
  const db = (await getEmailCacheDatabase())!;
  for (const key of ["a", "d", "g"])
    await db.put("threadRows", row(key, "old"));
  while (
    !(await db.get("localMailStorageLedger", "origin"))?.stores.threadRows
      ?.afterKey
  )
    await bootstrapLocalMailStorageLedgerBatch({ limit: 1 });
  let ledger = (await db.get("localMailStorageLedger", "origin"))!;
  expect(ledger.stores.threadRows).toEqual({
    bytes: localMailRecordBytes(row("a", "old")),
    complete: false,
    afterKey: ["account", "a"],
  });
  const tx = db.transaction(
    ["threadRows", "localMailStorageLedger"],
    "readwrite",
  );
  const measured = await meterLocalMailStorageTransaction(tx, {
    maxGrowthBytes: Number.POSITIVE_INFINITY,
    logicalLimitBytes: Number.POSITIVE_INFINITY,
  });
  await measured.objectStore("threadRows").put(row("0", "insert behind"));
  await measured.objectStore("threadRows").put(row("a", "updated prefix"));
  await measured.objectStore("threadRows").delete(["account", "d"]);
  await measured.objectStore("threadRows").put(row("z", "insert ahead"));
  await tx.done;
  ledger = (await db.get("localMailStorageLedger", "origin"))!;
  expect(ledger.stores.threadRows.bytes).toBe(
    localMailRecordBytes(row("0", "insert behind")) +
      localMailRecordBytes(row("a", "updated prefix")),
  );
  while (
    (await bootstrapLocalMailStorageLedgerBatch({ limit: 1 })) === "progress"
  ) {}
  ledger = (await db.get("localMailStorageLedger", "origin"))!;
  expect(ledger.stores.threadRows.complete).toBe(true);
  expect(ledger.stores.threadRows.bytes).toBe(
    (await db.getAll("threadRows")).reduce(
      (sum, value) => sum + localMailRecordBytes(value),
      0,
    ),
  );
});

it("counts actual attachment Blob bytes once, independently of the numeric byteSize counter", () => {
  const value = {
    emailAccountId: "account",
    blob: new Blob([new Uint8Array(1024)]),
    byteSize: 1024,
  };
  expect(localMailRecordBytes(value)).toBe(
    1024 + localMailRecordBytes({ emailAccountId: "account", byteSize: 1024 }),
  );
});

it("prevents competing accounts spending the same logical allowance with a constant generous origin allowance", async () => {
  const db = (await getEmailCacheDatabase())!;
  await db.put("localMailStorageLedger", readyLedger());
  const value = row("one", "body");
  const budget = localMailRecordBytes(value);
  const write = async (account: string) => {
    const tx = db.transaction(
      ["threadRows", "localMailStorageLedger"],
      "readwrite",
    );
    const measured = await meterLocalMailStorageTransaction(tx, {
      maxGrowthBytes: 1_000_000,
      logicalLimitBytes: budget,
      enforceLogicalBudget: true,
    });
    await measured
      .objectStore("threadRows")
      .put({ ...value, emailAccountId: account });
    await tx.done;
  };
  const results = await Promise.allSettled([
    write("account"),
    write("another"),
  ]);
  expect(
    results.filter((result) => result.status === "fulfilled"),
  ).toHaveLength(1);
  expect(results.filter((result) => result.status === "rejected")).toHaveLength(
    1,
  );
  expect(await db.count("threadRows")).toBe(1);
  expect(
    localMailLedgerBytes((await db.get("localMailStorageLedger", "origin"))!),
  ).toBe(budget);
});

it("rolls back ledger and all data when a later representation exceeds the limit", async () => {
  const db = (await getEmailCacheDatabase())!;
  const initial = readyLedger();
  await db.put("localMailStorageLedger", initial);
  const tx = db.transaction(
    ["threadRows", "localMailStorageLedger"],
    "readwrite",
  );
  const value = row("one", "body");
  const measured = await meterLocalMailStorageTransaction(tx, {
    maxGrowthBytes: Number.POSITIVE_INFINITY,
    logicalLimitBytes: localMailRecordBytes(value),
    enforceLogicalBudget: true,
  });
  await measured.objectStore("threadRows").put(value);
  await expect(
    measured.objectStore("threadRows").put(row("two", "body")),
  ).rejects.toBeInstanceOf(LocalMailStorageCapacityError);
  await tx.done.catch(() => undefined);
  expect(await db.count("threadRows")).toBe(0);
  expect(await db.get("localMailStorageLedger", "origin")).toEqual(initial);
});

it("allows optional growth while bootstrap is incomplete and still permits a protected shrinking write", async () => {
  const db = (await getEmailCacheDatabase())!;
  await db.put("threadRows", row("old", "body"));
  const tx = db.transaction(
    ["threadRows", "localMailStorageLedger"],
    "readwrite",
  );
  const measured = await meterLocalMailStorageTransaction(tx, {
    maxGrowthBytes: Number.POSITIVE_INFINITY,
    logicalLimitBytes: 1_000_000,
    enforceLogicalBudget: true,
  });
  // There is no measured total to compare against yet, and the scan counts this
  // row when it reaches it, so refusing the write would only lose cached mail.
  await measured.objectStore("threadRows").put(row("new", "body"));
  await tx.done;
  expect(await db.count("threadRows")).toBe(2);
  const cleanup = db.transaction(
    ["threadRows", "localMailStorageLedger"],
    "readwrite",
  );
  const protectedWrite = await meterLocalMailStorageTransaction(cleanup, {
    maxGrowthBytes: 0,
    logicalLimitBytes: 0,
    enforceLogicalBudget: true,
  });
  await protectedWrite.objectStore("threadRows").delete(["account", "old"]);
  await cleanup.done;
  expect(await db.get("threadRows", ["account", "old"])).toBeUndefined();
  expect(await db.count("threadRows")).toBe(1);
});

it("clears a complete store and its counter without retaining another account's deleted bytes", async () => {
  const db = (await getEmailCacheDatabase())!;
  const value = row("old", "body");
  await db.put("threadRows", value);
  const ledger = readyLedger();
  ledger.stores.threadRows.bytes = localMailRecordBytes(value);
  await db.put("localMailStorageLedger", ledger);
  const tx = db.transaction(
    ["threadRows", "localMailStorageLedger"],
    "readwrite",
  );
  const measured = await meterLocalMailStorageTransaction(tx, {
    maxGrowthBytes: 0,
    logicalLimitBytes: 0,
    enforceLogicalBudget: true,
  });
  await measured.objectStore("threadRows").clear();
  await tx.done;
  expect(await db.count("threadRows")).toBe(0);
  expect(
    (await db.get("localMailStorageLedger", "origin"))?.stores.threadRows,
  ).toEqual({ bytes: 0, complete: true });
});

it("accounts protected outbox and draft growth and updates counters through cancellation and clear", async () => {
  const db = (await getEmailCacheDatabase())!;
  await db.put("localMailStorageLedger", readyLedger());
  const mutation = await enqueueMailMutation(
    {
      id: "action",
      emailAccountId: "account",
      threadId: "thread",
      messageIds: ["message"],
      kind: "set_read_state",
      read: true,
    },
    1000,
  );
  expect(
    (await db.get("localMailStorageLedger", "origin"))?.stores.mailMutations
      .bytes,
  ).toBe(localMailRecordBytes(await db.get("mailMutations", mutation.id)));
  const writer = createReplyDraftWriter({
    emailAccountId: "account",
    threadId: "thread",
    messageId: "message",
  });
  await writer.save({
    values: { to: "recipient@example.com", subject: "Draft" },
    draft: {
      mode: "rich",
      editableHtml: "Unsent",
      quotedHtml: "",
      signatureHtml: "",
      unsupported: [],
    },
    attachments: [],
    preservedBlocks: [],
  });
  expect(
    (await db.get("localMailStorageLedger", "origin"))?.stores.replyDrafts
      .bytes,
  ).toBe(
    localMailRecordBytes(
      await db.get("replyDrafts", ["account", "thread", "message"]),
    ),
  );
  await writer.clear();
  expect(
    (await db.get("localMailStorageLedger", "origin"))?.stores.replyDrafts
      .bytes,
  ).toBe(
    localMailRecordBytes(
      await db.get("replyDrafts", ["account", "thread", "message"]),
    ),
  );
  await cancelPendingMailMutation(mutation.id);
  expect(
    (await db.get("localMailStorageLedger", "origin"))?.stores.mailMutations
      .bytes,
  ).toBe(0);
});

it("account cleanup subtracts only that account's bytes and preserves other account totals", async () => {
  const db = (await getEmailCacheDatabase())!;
  await db.put("localMailStorageLedger", readyLedger());
  const first = row("first", "body");
  const second = { ...row("second", "body"), emailAccountId: "other" };
  const tx = db.transaction(
    ["threadRows", "localMailStorageLedger"],
    "readwrite",
  );
  const measured = await meterLocalMailStorageTransaction(tx, {
    maxGrowthBytes: Number.POSITIVE_INFINITY,
    logicalLimitBytes: Number.POSITIVE_INFINITY,
  });
  await measured.objectStore("threadRows").put(first);
  await measured.objectStore("threadRows").put(second);
  await tx.done;
  await clearEmailCacheForAccount("account");
  expect(await db.get("threadRows", ["account", "first"])).toBeUndefined();
  expect(await db.get("threadRows", ["other", "second"])).toEqual(second);
  expect(
    (await db.get("localMailStorageLedger", "origin"))?.stores.threadRows.bytes,
  ).toBe(localMailRecordBytes(second));
});

it("accounts every schema store and accepts checkpoints keyed like each store's primary key", async () => {
  const db = (await getEmailCacheDatabase())!;
  const names = Array.from(db.objectStoreNames).filter(
    (name) => name !== "localMailStorageLedger",
  );
  expect([...names].sort()).toEqual([...LOCAL_MAIL_ACCOUNTED_STORES].sort());
  const scan = db.transaction(names, "readonly");
  const stores = Object.fromEntries(
    names.map((name) => {
      const { keyPath } = scan.objectStore(name);
      const afterKey = Array.isArray(keyPath) ? keyPath.map(() => "k") : "k";
      return [name, { bytes: 0, complete: false, afterKey }];
    }),
  );
  await scan.done;
  await db.put("localMailStorageLedger", { ...readyLedger(), stores });
  const tx = db.transaction(["localMailStorageLedger"], "readwrite");
  const ledger = await readLocalMailStorageLedger(tx);
  await tx.done;
  expect(ledger).toMatchObject({ epoch: "epoch", stores });
});

function readyLedger(): LocalMailStorageLedger {
  return {
    id: "origin",
    epoch: "epoch",
    version: 1,
    index: { status: "ready", bytes: 0 },
    stores: Object.fromEntries(
      LOCAL_MAIL_ACCOUNTED_STORES.map((name) => [
        name,
        { bytes: 0, complete: true },
      ]),
    ),
  };
}
function row(threadId: string, body: string) {
  return {
    emailAccountId: "account",
    threadId,
    data: { body },
    fetchedAt: 1,
    lastAccessedAt: 1,
  };
}
