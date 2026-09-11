import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { clearEmailCache } from "./database";
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
