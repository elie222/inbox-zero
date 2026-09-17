import { installMailCacheStorageTestEnvironment } from "./optional-cache-write.test-helpers";
import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearEmailCache,
  clearEmailCacheForAccount,
  getEmailCacheDatabase,
} from "./database";
import { searchCachedMail } from "./search";
import { writeCachedThreadDetail } from "./threads";
import { writeCachedThreadList } from "./thread-lists";
import { applyMailboxSyncPage } from "./mailbox";
import type { ParsedMessage } from "@/utils/types";
import type { MailMutation } from "./mail-mutations";

vi.mock("./policy", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./policy")>()),
  // Exercise truncation without fake-indexeddb's linear cursor advance at production scale.
  EMAIL_CACHE_SEARCH_MAX_MESSAGES: 150,
}));

const accounts = [{ id: "account-a", labels: [] }];
const search = (query: string, mutations: MailMutation[] = []) =>
  searchCachedMail({ query, accounts, mutations });
installMailCacheStorageTestEnvironment();

beforeEach(async () => {
  await clearEmailCache();
});

describe("cached mail search", () => {
  it("searches bodies and metadata, groups messages, and returns only list fields", async () => {
    const first = message("first", {
      textPlain: "needle in the full body",
      textHtml: "<p>private body</p>",
    });
    const second = message("second", { subject: "Another message" });
    await writeCachedThreadDetail({
      emailAccountId: "account-a",
      threadId: first.threadId,
      variant: "full",
      data: { thread: { id: first.threadId, messages: [first, second] } },
    });
    const result = await search("needle");
    expect(result.status).toBe("ready");
    expect(result.threads).toHaveLength(1);
    expect(result.threads[0].thread.messageIds).toEqual(["first", "second"]);
    expect(result.threads[0].thread.messages[0]).not.toHaveProperty(
      "textPlain",
    );
    expect(result.threads[0].thread.messages[0]).not.toHaveProperty("textHtml");
    expect((await search("absent")).threads).toEqual([]);
  });
  it("isolates accounts even when message and thread IDs collide", async () => {
    for (const account of ["account-a", "account-b"]) {
      await seed(account, message("same", { subject: account }));
    }
    expect((await search("account-b")).threads).toEqual([]);
    const combined = await searchCachedMail({
      query: "account",
      accounts: [...accounts, { id: "account-b", labels: [] }],
      mutations: [],
    });
    expect(combined.threads.map((hit) => hit.emailAccountId)).toEqual([
      "account-a",
      "account-b",
    ]);
    await clearEmailCacheForAccount("account-a");
    expect((await search("account")).threads).toEqual([]);
  });
  it("applies pending mutations before filtering without hiding archived search matches", async () => {
    await seed("account-a", message("first"));
    const base = {
      id: "mutation",
      emailAccountId: "account-a",
      threadId: "thread",
      messageIds: ["first"],
      createdAt: Date.now(),
    };
    const archive = { ...base, kind: "archive" } as MailMutation;
    expect((await search("report", [archive])).threads).toHaveLength(1);
    expect((await search("in:inbox report", [archive])).threads).toHaveLength(
      0,
    );
    expect(
      (await search("report", [{ ...base, kind: "trash" } as MailMutation]))
        .threads,
    ).toHaveLength(0);
    expect(
      (
        await search("is:unread", [
          { ...base, kind: "set_read_state", read: true } as MailMutation,
        ])
      ).threads,
    ).toHaveLength(0);
    expect(
      (
        await search("is:starred", [
          { ...base, kind: "set_starred_state", starred: true } as MailMutation,
        ])
      ).threads,
    ).toHaveLength(1);
  });
  it("drops stale cached records and reflects sync deletions", async () => {
    const old = message("old");
    await writeCachedThreadList({
      emailAccountId: "account-a",
      viewKey: "old",
      threads: [{ id: "old", messages: [old] }],
      hasMore: false,
      now: Date.now() - 40 * 86_400_000,
    });
    expect((await search("report")).threads).toEqual([]);
    await seed("account-a", message("new"));
    await writeCachedThreadList({
      emailAccountId: "account-a",
      viewKey: "inbox",
      threads: [{ id: "thread", messages: [message("new")] }],
      hasMore: false,
    });
    expect((await search("report")).threads).toHaveLength(1);
    await applyMailboxSyncPage({
      emailAccountId: "account-a",
      page: {
        cursor: "deleted",
        reset: false,
        hasMore: false,
        upsertedMessages: [],
        deletedMessageIds: ["new"],
      },
    });
    expect((await search("report")).threads).toEqual([]);
  });
  it("does not approximate unsupported expressions", async () => {
    await seed("account-a", message("first"));
    expect(await search("report OR invoice")).toEqual({
      status: "unsupported",
      threads: [],
    });
  });
  it("keeps fresher metadata while retaining a cached body", async () => {
    const record = message("first", {
      textPlain: "needle",
      labelIds: ["INBOX", "UNREAD"],
    });
    await writeCachedThreadDetail({
      emailAccountId: "account-a",
      threadId: record.threadId,
      variant: "full",
      now: Date.now() - 1000,
      data: { thread: { id: record.threadId, messages: [record] } },
    });
    await writeCachedThreadList({
      emailAccountId: "account-a",
      viewKey: "inbox",
      threads: [
        {
          id: record.threadId,
          messages: [{ ...record, textPlain: undefined, labelIds: ["INBOX"] }],
        },
      ],
      hasMore: false,
    });
    expect((await search("needle")).threads).toHaveLength(1);
    expect((await search("needle is:unread")).threads).toHaveLength(0);
  });
  it.each([
    false,
    true,
  ])("merges detail bodies independently of metadata freshness (reverse access order: %s)", async (reverse) => {
    const db = await getEmailCacheDatabase();
    const tx = db!.transaction("threadDetails", "readwrite");
    const now = Date.now();
    const variants = [
      { textPlain: "obsolete body", labelIds: ["INBOX", "UNREAD"] },
      { textPlain: "needle body", labelIds: ["INBOX", "UNREAD"] },
      { textPlain: undefined, labelIds: ["INBOX"] },
    ];
    for (const [index, fields] of variants.entries()) {
      await tx.store.put({
        emailAccountId: "account-a",
        threadId: "thread",
        variant: String(index),
        data: {
          thread: { id: "thread", messages: [message("first", fields)] },
        },
        fetchedAt: now - 3000 + index * 1000,
        lastAccessedAt: now - (reverse ? index : 3 - index),
        byteSize: 1,
      });
    }
    await tx.done;
    expect((await search("needle")).threads).toHaveLength(1);
    expect((await search("obsolete")).threads).toHaveLength(0);
    expect((await search("needle is:unread")).threads).toHaveLength(0);
  });
  it("searches the most recently used bodies when the detail budget is exceeded", async () => {
    const db = await getEmailCacheDatabase();
    const tx = db!.transaction("threadDetails", "readwrite");
    const now = Date.now();
    for (let index = 0; index < 101; index++) {
      const threadId = index === 100 ? "z-newest" : `old-${index}`;
      const data = message(threadId, {
        threadId,
        textPlain: index === 100 ? "unique newest body" : "older content",
      });
      tx.store.put({
        emailAccountId: "account-a",
        threadId,
        variant: "full",
        data: { thread: { id: threadId, messages: [data] } },
        fetchedAt: now,
        lastAccessedAt: now - 101 + index,
        byteSize: 1000,
      });
    }
    await tx.done;
    expect(
      (await search("unique newest")).threads.map((hit) => hit.thread.id),
    ).toEqual(["z-newest"]);
  });

  it("bounds results for a large mailbox", async () => {
    const db = await getEmailCacheDatabase();
    const tx = db!.transaction("mailboxMessages", "readwrite");
    for (let i = 0; i < 201; i++) {
      const data = message(`m${i}`, {
        threadId: `t${i}`,
        internalDate: String(Date.now() + i),
      });
      tx.store.put({
        emailAccountId: "account-a",
        messageId: data.id,
        threadId: data.threadId,
        data,
        receivedAt: Number(data.internalDate),
        lastAccessedAt: Date.now(),
      });
    }
    await tx.done;
    const result = await search("report");
    expect(result.threads).toHaveLength(100);
    expect(result.threads[0].thread.id).toBe("t200");
  });
});

function message(
  id: string,
  overrides: Partial<ParsedMessage> = {},
): ParsedMessage {
  return {
    id,
    threadId: "thread",
    subject: "Quarterly report",
    snippet: "Budget",
    headers: {
      from: "user@example.com",
      to: "team@example.com",
      subject: "Quarterly report",
      date: "",
    },
    date: "2026-09-10",
    internalDate: "1789041600000",
    labelIds: ["INBOX", "UNREAD"],
    historyId: "1",
    inline: [],
    ...overrides,
  };
}
async function seed(emailAccountId: string, data: ParsedMessage) {
  await applyMailboxSyncPage({
    emailAccountId,
    after: new Date("2026-09-01"),
    page: {
      cursor: "ready",
      reset: true,
      hasMore: false,
      deletedMessageIds: [],
      upsertedMessages: [data],
    },
  });
}
