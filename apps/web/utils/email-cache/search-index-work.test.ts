import "fake-indexeddb/auto";
import type { ParsedMessage } from "@/utils/types";
import { applyMailboxSyncPage } from "./mailbox";
import { writeCachedThreadList, writeCachedThreadRows } from "./thread-lists";
import { writeCachedThreadDetail } from "./threads";
import { beforeEach, describe, expect, it } from "vitest";
import {
  clearEmailCache,
  clearEmailCacheForAccount,
  getEmailCacheDatabase,
} from "./database";
import {
  acknowledgeSearchIndexWork,
  markSearchThreadsDirty,
  readSearchIndexWork,
} from "./search-index-work";

describe("durable search index work", () => {
  beforeEach(async () => {
    await clearEmailCache();
  });

  it("does not enqueue index work before index activation", async () => {
    await changeThreads("account-1", ["thread-1"]);
    expect(await readSearchIndexWork("account-1")).toBeUndefined();
    expect(
      await (await getEmailCacheDatabase())!.count("searchIndexWork"),
    ).toBe(0);
  });

  it("rolls back mail and index work together", async () => {
    const database = (await getEmailCacheDatabase())!;
    await activate("account-1");
    const transaction = database.transaction(
      ["threadRows", "searchIndexAccounts", "searchIndexWork"],
      "readwrite",
    );
    await transaction.objectStore("threadRows").put({
      emailAccountId: "account-1",
      threadId: "thread-1",
      data: {},
      fetchedAt: 1,
      lastAccessedAt: 1,
    });
    await markSearchThreadsDirty(transaction, "account-1", ["thread-1"]);
    transaction.abort();
    await transaction.done.catch(() => {});
    expect(await database.count("threadRows")).toBe(0);
    expect((await readSearchIndexWork("account-1"))?.work).toEqual([]);
  });

  it("retains newer edits when acknowledging an older indexing batch", async () => {
    await activate("account-1");
    await changeThreads("account-1", ["thread-1", "thread-2"]);
    const batch = (await readSearchIndexWork("account-1"))!;
    await changeThreads("account-1", ["thread-1"]);
    expect(
      await acknowledgeSearchIndexWork({
        emailAccountId: "account-1",
        ...batch,
      }),
    ).toBe(true);
    expect(
      (await readSearchIndexWork("account-1"))?.work.map(
        (item) => item.threadId,
      ),
    ).toEqual(["thread-1"]);
    const retry = (await readSearchIndexWork("account-1"))!;
    await acknowledgeSearchIndexWork({ emailAccountId: "account-1", ...retry });
    expect((await readSearchIndexWork("account-1"))?.work).toEqual([]);
  });

  it("fences pre-clear acknowledgements after account reactivation", async () => {
    await activate("account-1");
    await activate("account-2");
    await changeThreads("account-1", ["thread-1"]);
    await changeThreads("account-2", ["thread-2"]);
    const stale = (await readSearchIndexWork("account-1"))!;
    await clearEmailCacheForAccount("account-1");
    await activate("account-1");
    await changeThreads("account-1", ["thread-1"]);
    expect(
      await acknowledgeSearchIndexWork({
        emailAccountId: "account-1",
        ...stale,
      }),
    ).toBe(false);
    expect((await readSearchIndexWork("account-1"))?.work).toHaveLength(1);
    expect((await readSearchIndexWork("account-2"))?.work).toHaveLength(1);
  });

  it("queues downloaded metadata and opened bodies, including deletion from list-only cache", async () => {
    await activate("account-1");
    const message = getMessage("message-1", "thread-1");
    await writeCachedThreadList({
      emailAccountId: "account-1",
      viewKey: "inbox",
      threads: [{ id: message.threadId, messages: [message] }],
      hasMore: false,
    });
    await acknowledgeCurrentWork();
    await writeCachedThreadDetail({
      emailAccountId: "account-1",
      threadId: message.threadId,
      variant: "default",
      data: {
        thread: {
          id: message.threadId,
          messages: [{ ...message, textPlain: "Full searchable body" }],
          snippet: "",
        },
      },
    });
    expect(
      (await readSearchIndexWork("account-1"))?.work.map(
        (item) => item.threadId,
      ),
    ).toEqual(["thread-1"]);
    await acknowledgeCurrentWork();
    await applyMailboxSyncPage({
      emailAccountId: "account-1",
      after: new Date(0),
      page: {
        cursor: "next",
        hasMore: false,
        reset: false,
        upsertedMessages: [],
        deletedMessageIds: [message.id],
      },
    });
    expect(
      (await readSearchIndexWork("account-1"))?.work.map(
        (item) => item.threadId,
      ),
    ).toEqual(["thread-1"]);
    expect(await (await getEmailCacheDatabase())!.count("threadRows")).toBe(0);
    expect(await (await getEmailCacheDatabase())!.count("threadDetails")).toBe(
      0,
    );
  });

  it("queues reset removals even when absent from the replacement page", async () => {
    await activate("account-1");
    await applyMailboxSyncPage({
      emailAccountId: "account-1",
      after: new Date(0),
      page: {
        cursor: "first",
        hasMore: false,
        reset: true,
        upsertedMessages: [getMessage("old-message", "old-thread")],
        deletedMessageIds: [],
      },
    });
    await acknowledgeCurrentWork();
    await applyMailboxSyncPage({
      emailAccountId: "account-1",
      after: new Date(0),
      page: {
        cursor: "replacement",
        hasMore: false,
        reset: true,
        upsertedMessages: [getMessage("new-message", "new-thread")],
        deletedMessageIds: [],
      },
    });
    expect(
      (await readSearchIndexWork("account-1"))?.work.map(
        (item) => item.threadId,
      ),
    ).toEqual(["new-thread", "old-thread"]);
  });

  it("keeps optimistic projection changes out of canonical index content", async () => {
    await activate("account-1");
    const message = getMessage("message-1", "thread-1");
    await writeCachedThreadRows({
      emailAccountId: "account-1",
      fetchedAt: Date.now() - 1000,
      threads: [{ id: "thread-1", messages: [message] }],
    });
    await acknowledgeCurrentWork();
    await writeCachedThreadRows({
      emailAccountId: "account-1",
      threads: [
        { id: "thread-1", messages: [{ ...message, labelIds: ["TRASH"] }] },
      ],
    });
    expect((await readSearchIndexWork("account-1"))?.work).toEqual([]);
    expect(
      (
        await (await getEmailCacheDatabase())!.get("localMailMessages", [
          "account-1",
          "message-1",
        ])
      )?.data.labelIds,
    ).toEqual(["INBOX"]);
  });

  it("bounds replay batches while retaining all queued threads", async () => {
    await activate("account-1");
    await changeThreads(
      "account-1",
      Array.from({ length: 125 }, (_, i) => `thread-${i}`),
    );
    const batch = (await readSearchIndexWork("account-1"))!;
    expect(batch.work).toHaveLength(100);
    await acknowledgeSearchIndexWork({ emailAccountId: "account-1", ...batch });
    expect((await readSearchIndexWork("account-1"))?.work).toHaveLength(25);
  });
});

async function activate(emailAccountId: string) {
  await (await getEmailCacheDatabase())!.put("searchIndexAccounts", {
    emailAccountId,
    generation: crypto.randomUUID(),
  });
}
async function changeThreads(emailAccountId: string, threadIds: string[]) {
  const transaction = (await getEmailCacheDatabase())!.transaction(
    ["searchIndexAccounts", "searchIndexWork"],
    "readwrite",
  );
  await markSearchThreadsDirty(transaction, emailAccountId, threadIds);
  await transaction.done;
}

async function acknowledgeCurrentWork() {
  const batch = (await readSearchIndexWork("account-1"))!;
  await acknowledgeSearchIndexWork({ emailAccountId: "account-1", ...batch });
}
function getMessage(id: string, threadId: string): ParsedMessage {
  return {
    id,
    threadId,
    headers: {
      from: "sender@example.com",
      to: "user@example.com",
      date: "2026-01-01",
      subject: "Example",
    },
    date: "2026-01-01",
    internalDate: "1767225600000",
    historyId: "1",
    inline: [],
    labelIds: ["INBOX"],
    subject: "Example",
    snippet: "Example",
  };
}
