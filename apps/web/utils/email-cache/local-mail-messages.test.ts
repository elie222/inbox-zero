import { installMailCacheStorageTestEnvironment } from "./optional-cache-write.test-helpers";
import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import type { ParsedMessage } from "@/utils/types";
import { clearEmailCache, getEmailCacheDatabase } from "./database";
import {
  deleteLocalMailMessages,
  storeLocalMailMessages,
} from "./local-mail-messages";
import { writeCachedThreadDetail } from "./threads";
import { writeCachedThreadList, writeCachedThreadRows } from "./thread-lists";

const accountId = "account-1";

installMailCacheStorageTestEnvironment();

describe("canonical mail freshness", () => {
  beforeEach(async () => {
    await clearEmailCache();
    await (await getEmailCacheDatabase())!.put("searchIndexAccounts", {
      emailAccountId: accountId,
      generation: "generation-1",
    });
  });

  it("rejects replayed responses after deletion and permits a newer provider snapshot", async () => {
    await store([message("message-1")], 100);
    const db = (await getEmailCacheDatabase())!;
    const tx = db.transaction(
      [
        "localMailMessages",
        "localMailTombstones",
        "searchIndexAccounts",
        "searchIndexWork",

        "localMailAttachmentFiles",
        "localMailAttachmentJobs",
        "localMailThreadProtection",
      ],
      "readwrite",
    );
    await deleteLocalMailMessages(tx, accountId, ["message-1"], 200);
    await tx.done;
    await store([message("message-1")], 100);
    await store([message("message-1")], 200);
    await writeCachedThreadList({
      emailAccountId: accountId,
      viewKey: "inbox",
      threads: [{ id: "thread-1", messages: [message("message-1")] }],
      hasMore: false,
      now: 100,
    });
    expect(
      await db.get("localMailMessages", [accountId, "message-1"]),
    ).toBeUndefined();
    await store([message("message-1")], 300);
    expect(
      await db.get("localMailMessages", [accountId, "message-1"]),
    ).toBeDefined();
  });

  it("prunes omitted messages while preserving filtered drafts and newer messages", async () => {
    await store([message("removed"), message("draft", ["DRAFT"])], 100);
    await store([message("newer")], 300);
    await detail([], 200, "drafts:0|replies:0");
    const db = (await getEmailCacheDatabase())!;
    expect(
      await db.get("localMailMessages", [accountId, "removed"]),
    ).toBeUndefined();
    expect(
      await db.get("localMailMessages", [accountId, "draft"]),
    ).toBeDefined();
    expect(
      await db.get("localMailMessages", [accountId, "newer"]),
    ).toBeDefined();
    await store([message("removed")], 100);
    expect(
      await db.get("localMailMessages", [accountId, "removed"]),
    ).toBeUndefined();
    await detail([], 400, "drafts:1|replies:0");
    expect(await db.count("localMailMessages")).toBe(0);
  });

  it("does not replace full bodies with reply-parsed content", async () => {
    await store([{ ...message("message-1"), textPlain: "complete body" }], 100);
    await detail(
      [{ ...message("message-1"), textPlain: "reply only" }],
      200,
      "drafts:1|replies:1",
    );
    const record = await (await getEmailCacheDatabase())!.get(
      "localMailMessages",
      [accountId, "message-1"],
    );
    expect(record?.data.textPlain).toBe("complete body");
    expect(record?.bodyFetchedAt).toBe(100);
  });

  it("does not promote optimistic row projections into canonical mail", async () => {
    await store([message("message-1", ["INBOX"])], 100);
    await writeCachedThreadRows({
      emailAccountId: accountId,
      threads: [
        { id: "thread-1", messages: [message("message-1", ["TRASH"])] },
      ],
      now: 200,
    });
    const record = await (await getEmailCacheDatabase())!.get(
      "localMailMessages",
      [accountId, "message-1"],
    );
    expect(record?.data.labelIds).toEqual(["INBOX"]);
  });

  it("accounts for replacement, replay, and deletion in the source transaction", async () => {
    const db = (await getEmailCacheDatabase())!;
    const original = { ...message("message-1"), textPlain: "body" };
    await store([original], 100);
    const first = (await db.get("localMailMessages", [
      accountId,
      original.id,
    ]))!;
    expect((await db.get("searchIndexAccounts", accountId))?.messageBytes).toBe(
      first.byteSize,
    );
    await store([original, original], 100);
    expect((await db.get("searchIndexAccounts", accountId))?.messageBytes).toBe(
      first.byteSize,
    );
    await store(
      [{ ...original, textPlain: "longer body with Unicode: 世界" }],
      200,
    );
    const updated = (await db.get("localMailMessages", [
      accountId,
      original.id,
    ]))!;
    expect(updated.byteSize).toBeGreaterThan(first.byteSize);
    expect((await db.get("searchIndexAccounts", accountId))?.messageBytes).toBe(
      updated.byteSize,
    );

    const tx = db.transaction(
      [
        "localMailMessages",
        "localMailTombstones",
        "searchIndexAccounts",
        "searchIndexWork",

        "localMailAttachmentFiles",
        "localMailAttachmentJobs",
        "localMailThreadProtection",
      ],
      "readwrite",
    );
    await deleteLocalMailMessages(tx, accountId, [original.id], 150);
    await tx.done;
    expect((await db.get("searchIndexAccounts", accountId))?.messageBytes).toBe(
      updated.byteSize,
    );
    await detail([], 300, "drafts:1|replies:0");
    expect((await db.get("searchIndexAccounts", accountId))?.messageBytes).toBe(
      0,
    );
  });

  it("rolls back size accounting when the source transaction aborts", async () => {
    const db = (await getEmailCacheDatabase())!;
    await store([message("message-1")], 100);
    const before = await db.get("searchIndexAccounts", accountId);
    const tx = db.transaction(
      [
        "localMailMessages",
        "localMailTombstones",
        "searchIndexAccounts",
        "searchIndexWork",

        "localMailAttachmentFiles",
        "localMailAttachmentJobs",
        "localMailThreadProtection",
      ],
      "readwrite",
    );
    await storeLocalMailMessages(tx, accountId, [message("message-2")], 200);
    const completion = tx.done.catch(() => undefined);
    tx.abort();
    await completion;
    expect(await db.get("searchIndexAccounts", accountId)).toEqual(before);
    expect(
      await db.get("localMailMessages", [accountId, "message-2"]),
    ).toBeUndefined();
  });
  it("keeps compact metadata for old mail without duplicating its body", async () => {
    const db = (await getEmailCacheDatabase())!;
    await store(
      [
        {
          ...message("historical"),
          date: "2001-01-01",
          internalDate: "978307200000",
          textPlain: "retained body",
          textHtml: "<p>retained body</p>",
        },
      ],
      100,
    );
    const compact = await db.get("mailboxMessages", [accountId, "historical"]);
    expect(compact?.receivedAt).toBe(978_307_200_000);
    expect(compact?.data.textPlain).toBeUndefined();
    expect(compact?.data.textHtml).toBeUndefined();
    expect(
      (await db.get("localMailMessages", [accountId, "historical"]))?.data
        .textPlain,
    ).toBe("retained body");
    await detail([], 200, "drafts:1|replies:0");
    expect(
      await db.get("mailboxMessages", [accountId, "historical"]),
    ).toBeUndefined();
  });

  it("repairs stale projection writes using newer canonical metadata", async () => {
    const db = (await getEmailCacheDatabase())!;
    await store([message("message-1", ["STARRED"])], 300);
    const tx = db.transaction(
      [
        "mailboxMessages",
        "localMailMessages",
        "localMailTombstones",
        "searchIndexAccounts",
        "searchIndexWork",

        "localMailAttachmentFiles",
        "localMailAttachmentJobs",
        "localMailThreadProtection",
      ],
      "readwrite",
    );
    await tx.objectStore("mailboxMessages").delete([accountId, "message-1"]);
    await deleteLocalMailMessages(tx, accountId, ["message-1"], 200);
    await tx.done;
    await store([message("message-1", ["UNREAD"])], 100);
    expect(
      (await db.get("mailboxMessages", [accountId, "message-1"]))?.data
        .labelIds,
    ).toEqual(["STARRED"]);
  });
});

async function store(messages: ParsedMessage[], fetchedAt: number) {
  const db = (await getEmailCacheDatabase())!;
  const tx = db.transaction(
    [
      "mailboxMessages",
      "localMailMessages",
      "localMailTombstones",
      "searchIndexAccounts",
      "searchIndexWork",

      "localMailAttachmentFiles",
      "localMailAttachmentJobs",
      "localMailThreadProtection",
    ],
    "readwrite",
  );
  await storeLocalMailMessages(tx, accountId, messages, fetchedAt);
  await tx.done;
}

async function detail(messages: ParsedMessage[], now: number, variant: string) {
  await writeCachedThreadDetail({
    emailAccountId: accountId,
    threadId: "thread-1",
    variant,
    now,
    data: { thread: { id: "thread-1", messages, snippet: "" } },
  });
}

function message(id: string, labelIds: string[] = []): ParsedMessage {
  return {
    id,
    threadId: "thread-1",
    labelIds,
    headers: {
      from: "sender@example.com",
      to: "recipient@example.com",
      subject: "Subject",
      date: "2026-01-01",
    },
    date: "2026-01-01",
    snippet: "snippet",
    subject: "Subject",
    historyId: "1",
    inline: [],
  };
}
