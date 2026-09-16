// @vitest-environment jsdom
import "fake-indexeddb/auto";
import type { ParsedMessage } from "@/utils/types";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearEmailCache,
  clearEmailCacheForAccount,
  getEmailCacheDatabase,
} from "./database";
import { activateMailSync } from "./mail-activation";
import {
  initializeSearchIndexAccount,
  seedSearchIndexWork,
} from "./search-index-seed";
import {
  acknowledgeSearchIndexWork,
  readSearchIndexWork,
} from "./search-index-work";
import { writeCachedThreadRows } from "./thread-lists";

vi.mock("./cleanup", () => ({ scheduleEmailCacheCleanup: vi.fn() }));

describe("resumable local index seeding", () => {
  beforeEach(async () => {
    await clearEmailCache();
  });

  it("does not create an index for assistant-only accounts", async () => {
    expect(await initializeSearchIndexAccount("account-1")).toBeUndefined();
    expect(await seedSearchIndexWork("account-1")).toBeUndefined();
    expect(
      await (await getEmailCacheDatabase())!.count("searchIndexAccounts"),
    ).toBe(0);
  });

  it("resumes bounded seeding and catches new rows behind its cursor", async () => {
    await writeCachedThreadRows({
      emailAccountId: "account-1",
      threads: Array.from({ length: 125 }, (_, i) => ({
        id: `thread-${String(i).padStart(3, "0")}`,
        messages: [getMessage(`thread-${String(i).padStart(3, "0")}`)],
      })),
    });
    activateMailSync("account-1");
    const account = (await initializeSearchIndexAccount("account-1"))!;
    expect((await initializeSearchIndexAccount("account-1"))?.generation).toBe(
      account.generation,
    );
    await seedSearchIndexWork("account-1"); // Empty mailbox store.
    expect(await seedSearchIndexWork("account-1")).toEqual({
      generation: account.generation,
      complete: false,
    });
    const batch = (await readSearchIndexWork("account-1"))!;
    expect(batch.work).toHaveLength(100);
    await acknowledgeSearchIndexWork({ emailAccountId: "account-1", ...batch });
    await writeCachedThreadRows({
      emailAccountId: "account-1",
      fetchedAt: Date.now(),
      threads: [
        { id: "thread-000-new", messages: [getMessage("thread-000-new")] },
      ],
    });
    await seedSearchIndexWork("account-1");
    expect(await seedSearchIndexWork("account-1")).toEqual({
      generation: account.generation,
      complete: true,
    });
    const remaining = (await readSearchIndexWork("account-1"))!.work;
    expect(remaining).toHaveLength(26);
    expect(remaining.map((item) => item.threadId)).toContain("thread-000-new");
    const database = (await getEmailCacheDatabase())!;
    const rows = await database.getAllFromIndex(
      "localMailMessages",
      "byAccount",
      "account-1",
    );
    expect(
      (await database.get("searchIndexAccounts", "account-1"))?.messageBytes,
    ).toBe(rows.reduce((total, row) => total + row.byteSize, 0));
  });

  it("resumes inside a conversation without exceeding one message batch", async () => {
    const messages = Array.from({ length: 150 }, (_, index) => ({
      ...getMessage("large-thread"),
      id: `message-${index}`,
    }));
    await writeCachedThreadRows({
      emailAccountId: "account-1",
      threads: [{ id: "large-thread", messages }],
    });
    activateMailSync("account-1");
    await initializeSearchIndexAccount("account-1");
    await seedSearchIndexWork("account-1");
    await seedSearchIndexWork("account-1");
    const database = (await getEmailCacheDatabase())!;
    expect(await database.count("localMailMessages")).toBe(100);
    await seedSearchIndexWork("account-1");
    expect(await database.count("localMailMessages")).toBe(150);
    expect((await seedSearchIndexWork("account-1"))?.complete).toBe(true);
  });

  it("revokes seeding on cleanup and creates a new generation on reactivation", async () => {
    activateMailSync("account-1");
    const old = (await initializeSearchIndexAccount("account-1"))!;
    await clearEmailCacheForAccount("account-1");
    expect(await seedSearchIndexWork("account-1")).toBeUndefined();
    activateMailSync("account-1");
    expect(
      (await initializeSearchIndexAccount("account-1"))?.generation,
    ).not.toBe(old.generation);
  });
});

function getMessage(threadId: string): ParsedMessage {
  return {
    id: `message-${threadId}`,
    threadId,
    headers: {
      date: "2026-01-01",
      from: "sender@example.com",
      to: "user@example.com",
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
