import { bootstrapLocalMailStorageLedgerBatch } from "./local-mail-storage-ledger-bootstrap";
import {
  localMailRecordBytes,
  localMailLedgerBytes,
} from "./local-mail-storage-ledger";
import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearEmailCache,
  clearEmailCacheForAccount,
  getEmailCacheDatabase,
} from "./database";
import {
  getLocalMailAttachmentReference,
  prepareLocalMailAttachmentDownload,
  commitLocalMailAttachmentDownload,
  readLocalMailAttachment,
  markLocalMailAttachmentDownloadFailed,
} from "./local-mail-attachments";

const account = "account-1";
const thread = "thread-1";
const options = {
  enforceLogicalBudget: false,
  attachmentBudgetBytes: 10,
  now: 1000,
  withStorageLock: async <T>(run: () => Promise<T>) => run(),
  readAdmission: async () => ({ remainingBytes: 100, limitBytes: 100_000 }),
};
beforeEach(clearEmailCache);

describe("local attachment storage", () => {
  it("does not reserve bytes when cancellation races storage admission", async () => {
    const reference = await seed(account, "message-1", 4);
    const controller = new AbortController();
    await expect(
      prepareLocalMailAttachmentDownload({
        reference,
        maxBytes: 4,
        ...options,
        signal: controller.signal,
        readAdmission: async () => {
          controller.abort();
          return { remainingBytes: 100, limitBytes: 100_000 };
        },
      }),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(await (await db()).count("localMailAttachmentJobs")).toBe(0);
    expect(await (await db()).count("localMailThreadProtection")).toBe(0);
  });

  it("caches an attachment while the ledger is still being measured", async () => {
    const reference = await seed(account, "message-1", 4);
    const database = await db();
    expect(
      (await database.get("localMailStorageLedger", "origin"))?.index.status,
    ).not.toBe("ready");
    const ticket = await prepareLocalMailAttachmentDownload({
      ...options,
      reference,
      maxBytes: 4,
      enforceLogicalBudget: true,
      // Physical headroom still applies while the ledger is unmeasured, so this
      // isolates the logical budget rather than the shared 100-byte allowance.
      readAdmission: async () => ({
        remainingBytes: 100_000,
        limitBytes: 100_000,
      }),
    });
    expect(ticket).toBeDefined();
    expect(
      await commitLocalMailAttachmentDownload({
        ...options,
        ticket: ticket!,
        blob: new Blob(["1234"]),
        enforceLogicalBudget: true,
        readAdmission: async () => ({
          remainingBytes: 100_000,
          limitBytes: 100_000,
        }),
      }),
    ).toBe(true);
    expect(await readLocalMailAttachment(reference)).toBeDefined();
  });

  it("rolls back binary plus metadata when logical headroom is insufficient", async () => {
    const reference = await seed(account, "message-1", 4);
    const database = await db();
    while ((await bootstrapLocalMailStorageLedgerBatch()) === "progress") {}
    const ledger = (await database.get("localMailStorageLedger", "origin"))!;
    ledger.index = { status: "ready", bytes: 0 };
    await database.put("localMailStorageLedger", ledger);
    const generous = {
      ...options,
      enforceLogicalBudget: true,
      readAdmission: async () => ({
        remainingBytes: 100_000,
        limitBytes: 100_000,
      }),
    };
    const ticket = (await prepareLocalMailAttachmentDownload({
      ...generous,
      reference,
      maxBytes: 4,
    }))!;
    expect(ticket).toBeDefined();
    const before = (await database.get("localMailStorageLedger", "origin"))!;
    const jobs = await database.getAll("localMailAttachmentJobs");
    const protections = await database.getAll("localMailThreadProtection");
    expect(
      await commitLocalMailAttachmentDownload({
        ...generous,
        ticket,
        blob: new Blob(["1234"]),
        readAdmission: async () => ({
          remainingBytes: 100_000,
          limitBytes: localMailLedgerBytes(before) + 4,
        }),
      }),
    ).toBe(false);
    expect(await database.count("localMailAttachmentFiles")).toBe(0);
    expect(await database.getAll("localMailAttachmentJobs")).toEqual(jobs);
    expect(await database.getAll("localMailThreadProtection")).toEqual(
      protections,
    );
    expect(await database.get("localMailStorageLedger", "origin")).toEqual(
      before,
    );
    expect(
      await commitLocalMailAttachmentDownload({
        ...generous,
        ticket,
        blob: new Blob(["1234"]),
      }),
    ).toBe(true);
    expect(await readLocalMailAttachment(reference)).toBeDefined();
  });

  it("consumes its own payload reservation once", async () => {
    const reference = await seed(account, "message-1", 10_000);
    const database = await db();
    while ((await bootstrapLocalMailStorageLedgerBatch()) === "progress") {}
    const ledger = (await database.get("localMailStorageLedger", "origin"))!;
    ledger.index = { status: "ready", bytes: 0 };
    await database.put("localMailStorageLedger", ledger);
    const generous = {
      ...options,
      attachmentBudgetBytes: 50_000,
      enforceLogicalBudget: true,
      readAdmission: async () => ({
        remainingBytes: 100_000,
        limitBytes: 100_000,
      }),
    };
    const ticket = (await prepareLocalMailAttachmentDownload({
      ...generous,
      reference,
      maxBytes: 10_000,
    }))!;
    expect(ticket).toBeDefined();
    const beforeBytes = localMailLedgerBytes(
      (await database.get("localMailStorageLedger", "origin"))!,
    );
    expect(
      await commitLocalMailAttachmentDownload({
        ...generous,
        ticket,
        blob: new Blob([new Uint8Array(10_000)]),
        readAdmission: async () => ({
          remainingBytes: 12_000,
          limitBytes: beforeBytes + 12_000,
        }),
      }),
    ).toBe(true);
    const protection = await database.get("localMailThreadProtection", [
      account,
      thread,
    ]);
    expect(protection?.reservations?.[ticket.reservationId]).toBeUndefined();
  });

  it("meters binary commits and account cleanup in the same durable ledger", async () => {
    const reference = await seed(account, "message-1", 4);
    while (
      (await bootstrapLocalMailStorageLedgerBatch({ limit: 100 })) ===
      "progress"
    ) {}
    await cache(reference);
    const database = await db();
    const files = await database.getAll("localMailAttachmentFiles");
    const ledger = (await database.get("localMailStorageLedger", "origin"))!;
    expect(ledger.stores.localMailAttachmentFiles.bytes).toBe(
      files.reduce((sum, file) => sum + localMailRecordBytes(file), 0),
    );
    expect(ledger.stores.localMailAttachmentFiles.bytes).toBeGreaterThan(4);
    await clearEmailCacheForAccount(account);
    expect(
      (await database.get("localMailStorageLedger", "origin"))!.stores
        .localMailAttachmentFiles.bytes,
    ).toBe(0);
  });

  it("stores only completed binary files and checks actual size against its reservation", async () => {
    const reference = await seed(account, "message-1", 4);
    const ticket = await prepareLocalMailAttachmentDownload({
      reference,
      maxBytes: 4,
      ...options,
    });
    expect(ticket).toBeDefined();
    expect(await readLocalMailAttachment(reference)).toBeUndefined();
    expect(
      await commitLocalMailAttachmentDownload({
        ticket: ticket!,
        blob: new Blob(["12345"]),
        ...options,
      }),
    ).toBe(false);
    expect(await readLocalMailAttachment(reference)).toBeUndefined();
    expect(
      await commitLocalMailAttachmentDownload({
        ticket: ticket!,
        blob: new Blob(["1234"]),
        ...options,
      }),
    ).toBe(true);
    expect(await (await readLocalMailAttachment(reference))?.text()).toBe(
      "1234",
    );
    expect(await (await db()).count("localMailAttachmentFiles")).toBe(1);
    expect(
      (await (await db()).get("searchIndexAccounts", account))?.attachmentBytes,
    ).toBe(4);
  });

  it("rolls back blob bytes and progress together when a commit fails", async () => {
    const reference = await seed(account, "message-1", 4);
    const ticket = await prepareLocalMailAttachmentDownload({
      reference,
      maxBytes: 4,
      ...options,
    });
    const put = IDBObjectStore.prototype.put;
    const failure = vi
      .spyOn(IDBObjectStore.prototype, "put")
      .mockImplementation(function (value, key) {
        if (this.name === "searchIndexAccounts")
          throw new Error("Storage failure");
        return put.call(this, value, key);
      });
    try {
      await expect(
        commitLocalMailAttachmentDownload({
          ticket: ticket!,
          blob: new Blob(["1234"]),
          ...options,
        }),
      ).rejects.toThrow("Storage failure");
    } finally {
      failure.mockRestore();
    }
    expect(await readLocalMailAttachment(reference)).toBeUndefined();
    expect(
      (await (await db()).getAll("localMailAttachmentJobs"))[0]?.state,
    ).toBe("pending");
    expect(
      (await (await db()).get("searchIndexAccounts", account))
        ?.attachmentBytes ?? 0,
    ).toBe(0);
  });

  it("does not recreate a reservation after cleanup during admission", async () => {
    const reference = await seed(account, "message-1", 4);
    expect(
      await prepareLocalMailAttachmentDownload({
        reference,
        maxBytes: 4,
        ...options,
        readAdmission: async () => {
          await clearEmailCacheForAccount(account);
          await seed(account, "message-1", 4);
          return { remainingBytes: 100, limitBytes: 100_000 };
        },
      }),
    ).toBeUndefined();
    expect(await (await db()).count("localMailAttachmentJobs")).toBe(0);
  });

  it("shares live reservations across accounts and releases failed downloads", async () => {
    const first = await seed(account, "message-1", 6);
    const second = await seed("account-2", "message-2", 6);
    const ticket = await prepareLocalMailAttachmentDownload({
      reference: first,
      maxBytes: 6,
      ...options,
    });
    expect(
      await prepareLocalMailAttachmentDownload({
        reference: second,
        maxBytes: 6,
        ...options,
      }),
    ).toBeUndefined();
    await markLocalMailAttachmentDownloadFailed(ticket!);
    expect(
      await prepareLocalMailAttachmentDownload({
        reference: second,
        maxBytes: 6,
        ...options,
      }),
    ).toBeDefined();
  });

  it("fences a replaced reservation and lets expired reservations release capacity", async () => {
    const reference = await seed(account, "message-1", 4);
    const old = await prepareLocalMailAttachmentDownload({
      reference,
      maxBytes: 4,
      ...options,
    });
    const replacement = await prepareLocalMailAttachmentDownload({
      reference,
      maxBytes: 4,
      ...options,
    });
    expect(
      await commitLocalMailAttachmentDownload({
        ticket: old!,
        blob: new Blob(["1234"]),
        ...options,
      }),
    ).toBe(false);
    const other = await seed("account-2", "message-2", 8);
    expect(
      await prepareLocalMailAttachmentDownload({
        reference: other,
        maxBytes: 8,
        ...options,
        now: 400_000,
      }),
    ).toBeDefined();
    expect(
      await commitLocalMailAttachmentDownload({
        ticket: replacement!,
        blob: new Blob(["1234"]),
        ...options,
        now: 400_000,
      }),
    ).toBe(false);
  });

  it("does not evict files attached to pending outgoing work", async () => {
    const reference = await seed(account, "message-1", 4);
    await cache(reference);
    const database = await db();
    const outgoing = {
      id: "pending",
      batchId: "batch",
      emailAccountId: account,
      threadId: thread,
      messageIds: ["message-1"],
      kind: "reply" as const,
      payload: { attachment: "protected" },
      status: "pending" as const,
      attempts: 0,
      nextAttemptAt: 1,
      createdAt: 1,
      updatedAt: 1,
    };
    await database.put("mailMutations", outgoing);
    const other = await seed("account-2", "message-2", 8);
    expect(
      await prepareLocalMailAttachmentDownload({
        reference: other,
        maxBytes: 8,
        ...options,
      }),
    ).toBeUndefined();
    expect(await readLocalMailAttachment(reference)).toBeDefined();
    expect(await database.get("mailMutations", "pending")).toEqual(outgoing);
  });

  it("never uses incoming-mail headroom beyond actual origin admission", async () => {
    const reference = await seed(account, "message-1", 4);
    expect(
      await prepareLocalMailAttachmentDownload({
        reference,
        maxBytes: 4,
        ...options,
        readAdmission: async () => ({ remainingBytes: 3, limitBytes: 100_000 }),
      }),
    ).toBeUndefined();
  });

  it("keeps pinned files and evicts unpinned least-recently-used files", async () => {
    const first = await seed(account, "first", 4);
    const second = await seed(account, "second", 4, "thread-2");
    const third = await seed(account, "third", 4, "thread-3");
    await cache(first);
    const database = await db();
    const protection = (await database.get("localMailThreadProtection", [
      account,
      thread,
    ]))!;
    await database.put("localMailThreadProtection", {
      ...protection,
      pinned: true,
    });
    await cache(second, 2000);
    await cache(third, 3000);
    expect(await readLocalMailAttachment(first)).toBeDefined();
    expect(await readLocalMailAttachment(second)).toBeUndefined();
    expect(await readLocalMailAttachment(third)).toBeDefined();
  });

  it("fences late commits after account cleanup and preserves another account", async () => {
    const reference = await seed(account, "message-1", 4);
    const other = await seed("account-2", "message-2", 4);
    await cache(other);
    const ticket = await prepareLocalMailAttachmentDownload({
      reference,
      maxBytes: 4,
      ...options,
    });
    await clearEmailCacheForAccount(account);
    expect(
      await commitLocalMailAttachmentDownload({
        ticket: ticket!,
        blob: new Blob(["1234"]),
        ...options,
      }),
    ).toBe(false);
    expect(await readLocalMailAttachment(other)).toBeDefined();
    expect(await (await db()).count("localMailAttachmentJobs")).toBe(1);
  });

  it("keeps valid blobs through source-generation migration but fences old tickets", async () => {
    const reference = await seed(account, "message-1", 4);
    await cache(reference);
    const second = await seed(account, "message-2", 4);
    const ticket = await prepareLocalMailAttachmentDownload({
      reference: second,
      maxBytes: 4,
      ...options,
    });
    const database = await db();
    const current = (await database.get("searchIndexAccounts", account))!;
    await database.put("searchIndexAccounts", {
      ...current,
      generation: "new",
    });
    expect(await readLocalMailAttachment(reference)).toBeDefined();
    expect(
      await commitLocalMailAttachmentDownload({
        ticket: ticket!,
        blob: new Blob(["1234"]),
        ...options,
      }),
    ).toBe(false);
  });
});

async function db() {
  return (await getEmailCacheDatabase())!;
}
async function seed(
  emailAccountId: string,
  messageId: string,
  size?: number,
  threadId = thread,
) {
  const database = await db();
  if (!(await database.get("searchIndexAccounts", emailAccountId)))
    await database.put("searchIndexAccounts", {
      emailAccountId,
      generation: "generation-1",
      messageBytes: 0,
    });
  await database.put("localMailMessages", {
    emailAccountId,
    threadId,
    messageId,
    fetchedAt: 1,
    bodyFetchedAt: 1,
    receivedAt: 1,
    lastAccessedAt: 1,
    byteSize: 0,
    data: {
      id: messageId,
      threadId,
      date: "",
      headers: { from: "", to: "", subject: "", date: "" },
      historyId: "",
      snippet: "",
      subject: "",
      inline: [],
      attachments: [
        {
          attachmentId: "file",
          filename: "file.txt",
          mimeType: "text/plain",
          size: size ?? 0,
          headers: {
            "content-description": "",
            "content-id": "",
            "content-type": "text/plain",
            "content-transfer-encoding": "",
          },
        },
      ],
    },
  });
  return (await getLocalMailAttachmentReference({
    emailAccountId,
    messageId,
    attachmentId: "file",
  }))!;
}
async function cache(reference: Awaited<ReturnType<typeof seed>>, now = 1000) {
  const ticket = await prepareLocalMailAttachmentDownload({
    reference,
    maxBytes: 4,
    ...options,
    now,
  });
  expect(ticket).toBeDefined();
  expect(
    await commitLocalMailAttachmentDownload({
      ticket: ticket!,
      blob: new Blob(["1234"]),
      ...options,
      now,
    }),
  ).toBe(true);
}
