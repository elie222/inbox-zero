// @vitest-environment jsdom
import "fake-indexeddb/auto";
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
      threads: [{ id: "thread-000-new" }],
    });
    await seedSearchIndexWork("account-1");
    expect(await seedSearchIndexWork("account-1")).toEqual({
      generation: account.generation,
      complete: true,
    });
    const remaining = (await readSearchIndexWork("account-1"))!.work;
    expect(remaining).toHaveLength(26);
    expect(remaining.map((item) => item.threadId)).toContain("thread-000-new");
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
