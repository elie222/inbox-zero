import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearEmailCache } from "./database";
import { readMailboxSyncState } from "./mailbox";
import { syncMailboxPages } from "./mailbox-sync";

describe("mailbox sync coordinator", () => {
  beforeEach(async () => {
    await clearEmailCache();
  });

  it("starts with a recent snapshot and follows cursors to completion", async () => {
    const fetchPage = vi
      .fn()
      .mockResolvedValueOnce({
        accountId: "account-1",
        cursor: "cursor-1",
        deletedMessageIds: [],
        hasMore: true,
        reset: true,
        upsertedMessages: [],
      })
      .mockResolvedValueOnce({
        accountId: "account-1",
        cursor: "cursor-2",
        deletedMessageIds: [],
        hasMore: false,
        reset: false,
        upsertedMessages: [],
      });

    await expect(
      syncMailboxPages({
        emailAccountId: "account-1",
        fetchPage,
        now: new Date("2026-08-23T12:00:00.000Z"),
      }),
    ).resolves.toEqual({ hasMore: false, pagesSynced: 2 });
    expect(fetchPage).toHaveBeenNthCalledWith(1, {
      after: "2026-07-24T12:00:00.000Z",
      limit: 100,
    });
    expect(fetchPage).toHaveBeenNthCalledWith(2, {
      cursor: "cursor-1",
      limit: 100,
    });
    expect(await readMailboxSyncState("account-1")).toMatchObject({
      cursor: "cursor-2",
      hasMore: false,
    });
  });

  it("resumes from the persisted cursor and bounds work per run", async () => {
    const initialFetch = vi.fn().mockResolvedValue({
      accountId: "account-1",
      cursor: "cursor-1",
      deletedMessageIds: [],
      hasMore: true,
      reset: true,
      upsertedMessages: [],
    });
    await syncMailboxPages({
      emailAccountId: "account-1",
      fetchPage: initialFetch,
      maxPages: 1,
      now: new Date("2026-08-23T12:00:00.000Z"),
    });

    const resumedFetch = vi.fn().mockResolvedValue({
      accountId: "account-1",
      cursor: "cursor-2",
      deletedMessageIds: [],
      hasMore: false,
      reset: false,
      upsertedMessages: [],
    });
    await expect(
      syncMailboxPages({
        emailAccountId: "account-1",
        fetchPage: resumedFetch,
        maxPages: 1,
      }),
    ).resolves.toEqual({ hasMore: false, pagesSynced: 1 });
    expect(resumedFetch).toHaveBeenCalledWith({
      cursor: "cursor-1",
      limit: 100,
    });
  });

  it("periodically refreshes the rolling mailbox window", async () => {
    await syncMailboxPages({
      emailAccountId: "account-1",
      fetchPage: vi.fn().mockResolvedValue({
        accountId: "account-1",
        cursor: "old-cursor",
        deletedMessageIds: [],
        hasMore: false,
        reset: true,
        upsertedMessages: [],
      }),
      now: new Date("2026-07-01T12:00:00.000Z"),
    });

    const refreshFetch = vi.fn().mockResolvedValue({
      accountId: "account-1",
      cursor: "new-cursor",
      deletedMessageIds: [],
      hasMore: false,
      reset: true,
      upsertedMessages: [],
    });
    await syncMailboxPages({
      emailAccountId: "account-1",
      fetchPage: refreshFetch,
      now: new Date("2026-08-23T12:00:00.000Z"),
    });

    expect(refreshFetch).toHaveBeenCalledWith({
      after: "2026-07-24T12:00:00.000Z",
      limit: 100,
    });
    expect(await readMailboxSyncState("account-1")).toMatchObject({
      after: "2026-07-24T12:00:00.000Z",
      cursor: "new-cursor",
    });
  });

  it("rejects a response for a different account before persisting it", async () => {
    const fetchPage = vi.fn().mockResolvedValue({
      accountId: "account-2",
      cursor: "cursor",
      deletedMessageIds: [],
      hasMore: false,
      reset: true,
      upsertedMessages: [],
    });

    await expect(
      syncMailboxPages({
        emailAccountId: "account-1",
        fetchPage,
      }),
    ).rejects.toThrow("Mailbox sync response account mismatch");
    await expect(readMailboxSyncState("account-1")).resolves.toBeUndefined();
  });

  it("does not repopulate an account cache cleared during a request", async () => {
    const requestStarted = Promise.withResolvers<void>();
    const pendingPage = Promise.withResolvers<{
      accountId: string;
      cursor: string;
      deletedMessageIds: string[];
      hasMore: boolean;
      reset: boolean;
      upsertedMessages: never[];
    }>();
    const sync = syncMailboxPages({
      emailAccountId: "account-1",
      fetchPage: () => {
        requestStarted.resolve();
        return pendingPage.promise;
      },
    });
    await requestStarted.promise;

    await clearEmailCache();
    pendingPage.resolve({
      accountId: "account-1",
      cursor: "cursor",
      deletedMessageIds: [],
      hasMore: false,
      reset: true,
      upsertedMessages: [],
    });

    await expect(sync).resolves.toEqual({ hasMore: false, pagesSynced: 0 });
    await expect(readMailboxSyncState("account-1")).resolves.toBeUndefined();
  });
});
