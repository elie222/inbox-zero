import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { clearEmailCache, getEmailCacheDatabase } from "./database";
import {
  readCachedThreadList,
  writeCachedThreadList,
  writeCachedThreadRows,
} from "./thread-lists";

type TestThread = { id: string; subject: string };

describe("cached thread lists", () => {
  beforeEach(async () => {
    await clearEmailCache();
  });

  it("persists fresh account rows without letting an older response overwrite them", async () => {
    const now = Date.now();
    await writeCachedThreadRows({
      emailAccountId: "account-1",
      threads: [{ id: "thread-1", subject: "Fresh" }],
      fetchedAt: now,
    });
    await writeCachedThreadRows({
      emailAccountId: "account-1",
      threads: [{ id: "thread-1", subject: "Stale" }],
      fetchedAt: now - 1,
    });
    const database = await getEmailCacheDatabase();
    expect(
      await database?.get("threadRows", ["account-1", "thread-1"]),
    ).toMatchObject({ fetchedAt: now, data: { subject: "Fresh" } });
    expect(
      await database?.get("threadRows", ["account-2", "thread-1"]),
    ).toBeUndefined();
  });

  it("keeps a newer view when an older first-page response finishes later", async () => {
    const now = Date.now();
    await writeCachedThreadList({
      emailAccountId: "account-1",
      viewKey: "all",
      threads: [{ id: "fresh-thread", subject: "Fresh" }],
      hasMore: false,
      now,
    });
    await writeCachedThreadList({
      emailAccountId: "account-1",
      viewKey: "all",
      threads: [{ id: "stale-thread", subject: "Stale" }],
      hasMore: true,
      now: now - 1,
    });
    expect(
      await readCachedThreadList({
        emailAccountId: "account-1",
        viewKey: "all",
      }),
    ).toMatchObject({
      cachedAt: now,
      hasMore: false,
      threads: [{ id: "fresh-thread", subject: "Fresh" }],
    });
    const database = await getEmailCacheDatabase();
    expect(
      await database?.get("threadRows", ["account-1", "stale-thread"]),
    ).toBeUndefined();
  });

  it("preserves newer shared rows while accepting another view and its new rows", async () => {
    const now = Date.now();
    await writeCachedThreadRows({
      emailAccountId: "account-1",
      threads: [{ id: "shared-thread", subject: "Fresh" }],
      fetchedAt: now,
    });
    await writeCachedThreadList({
      emailAccountId: "account-1",
      viewKey: "all",
      hasMore: true,
      now: now - 1,
      threads: [
        { id: "shared-thread", subject: "Stale" },
        { id: "new-thread", subject: "New" },
      ],
    });
    expect(
      await readCachedThreadList({
        emailAccountId: "account-1",
        viewKey: "all",
      }),
    ).toMatchObject({
      cachedAt: now - 1,
      hasMore: true,
      threads: [
        { id: "shared-thread", subject: "Fresh" },
        { id: "new-thread", subject: "New" },
      ],
    });
  });

  it("normalizes rows shared by several views", async () => {
    const now = Date.now();
    await writeCachedThreadList({
      emailAccountId: "account-1",
      viewKey: "all",
      threads: [{ id: "thread-1", subject: "Old subject" }],
      hasMore: true,
      now: now - 1,
    });
    await writeCachedThreadList({
      emailAccountId: "account-1",
      viewKey: "unread",
      threads: [{ id: "thread-1", subject: "Updated subject" }],
      hasMore: false,
      now,
    });

    await expect(
      readCachedThreadList<TestThread>({
        emailAccountId: "account-1",
        viewKey: "all",
      }),
    ).resolves.toEqual({
      cachedAt: now - 1,
      hasMore: true,
      threads: [{ id: "thread-1", subject: "Updated subject" }],
    });
  });

  it("applies an optimistic row update to every cached view", async () => {
    const thread = { id: "thread-1", subject: "Unread" };
    await writeCachedThreadList({
      emailAccountId: "account-1",
      viewKey: "all",
      threads: [thread],
      hasMore: false,
    });
    await writeCachedThreadList({
      emailAccountId: "account-1",
      viewKey: "unread",
      threads: [thread],
      hasMore: false,
    });

    await writeCachedThreadRows({
      emailAccountId: "account-1",
      threads: [{ ...thread, subject: "Read" }],
    });

    const [all, unread] = await Promise.all(
      ["all", "unread"].map((viewKey) =>
        readCachedThreadList<TestThread>({
          emailAccountId: "account-1",
          viewKey,
        }),
      ),
    );
    expect(all?.threads[0]?.subject).toBe("Read");
    expect(unread?.threads[0]?.subject).toBe("Read");
  });

  it("isolates records by email account", async () => {
    await writeCachedThreadList({
      emailAccountId: "account-1",
      viewKey: "all",
      threads: [{ id: "shared-id", subject: "Account one" }],
      hasMore: false,
    });
    await writeCachedThreadList({
      emailAccountId: "account-2",
      viewKey: "all",
      threads: [{ id: "shared-id", subject: "Account two" }],
      hasMore: false,
    });

    const first = await readCachedThreadList<TestThread>({
      emailAccountId: "account-1",
      viewKey: "all",
    });
    const second = await readCachedThreadList<TestThread>({
      emailAccountId: "account-2",
      viewKey: "all",
    });

    expect(first?.threads[0]?.subject).toBe("Account one");
    expect(second?.threads[0]?.subject).toBe("Account two");
  });

  it("does not return an expired view", async () => {
    await writeCachedThreadList({
      emailAccountId: "account-1",
      viewKey: "all",
      threads: [{ id: "thread-1", subject: "Expired" }],
      hasMore: false,
      now: Date.now() - 31 * 24 * 60 * 60 * 1000,
    });

    await expect(
      readCachedThreadList<TestThread>({
        emailAccountId: "account-1",
        viewKey: "all",
      }),
    ).resolves.toBeUndefined();
  });
});
