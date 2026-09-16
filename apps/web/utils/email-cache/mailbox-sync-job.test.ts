import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearEmailCache,
  clearEmailCacheForAccount,
  getEmailCacheDatabase,
} from "./database";
import { applyMailboxSyncPage } from "./mailbox";
import {
  claimMailboxSyncJob,
  finishMailboxSyncJob,
  renewMailboxSyncJob,
} from "./mailbox-sync-job";
import { syncMailboxPages } from "./mailbox-sync";

describe("durable mailbox sync ownership", () => {
  beforeEach(async () => {
    vi.spyOn(Date, "now").mockReturnValue(1_000_000);
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    await clearEmailCache();
  });
  afterEach(() => vi.restoreAllMocks());

  it("allows only one owner across independent callers", async () => {
    const claims = await Promise.allSettled([
      claimMailboxSyncJob("account-1"),
      claimMailboxSyncJob("account-1"),
    ]);
    expect(claims.filter((claim) => claim.status === "fulfilled")).toHaveLength(
      1,
    );
    expect(claims.filter((claim) => claim.status === "rejected")).toHaveLength(
      1,
    );
    expect(await claimMailboxSyncJob("account-2")).toBeTruthy();
  });

  it("does not issue a second network request while another caller owns sync", async () => {
    const started = Promise.withResolvers<void>();
    const page = Promise.withResolvers<{
      accountId: string;
      cursor: string;
      hasMore: boolean;
      reset: boolean;
      deletedMessageIds: string[];
      upsertedMessages: never[];
    }>();
    const first = syncMailboxPages({
      emailAccountId: "account-1",
      fetchPage: () => {
        started.resolve();
        return page.promise;
      },
    });
    await started.promise;
    const otherFetch = vi.fn();
    await expect(
      syncMailboxPages({ emailAccountId: "account-1", fetchPage: otherFetch }),
    ).rejects.toMatchObject({ name: "MailboxSyncDeferredError" });
    expect(otherFetch).not.toHaveBeenCalled();
    page.resolve({
      accountId: "account-1",
      cursor: "done",
      hasMore: false,
      reset: true,
      deletedMessageIds: [],
      upsertedMessages: [],
    });
    await first;
  });

  it("persists provider cooldown across callers and permits retry afterward", async () => {
    const token = (await claimMailboxSyncJob("account-1"))!;
    await finishMailboxSyncJob("account-1", token, { retryAfterMs: 180_000 });
    await expect(claimMailboxSyncJob("account-1")).rejects.toMatchObject({
      retryAfterMs: 180_000,
    });
    await expect(
      claimMailboxSyncJob("account-1", { force: true }),
    ).rejects.toMatchObject({ retryAfterMs: 180_000 });
    vi.mocked(Date.now).mockReturnValue(1_180_001);
    expect(await claimMailboxSyncJob("account-1")).toBeTruthy();
  });

  it.each([
    { hasMore: true, delay: 10_000 },
    { hasMore: false, delay: 60_000 },
  ])("paces completed work across reloads, with foreground refresh allowed ($hasMore)", async ({
    hasMore,
    delay,
  }) => {
    const token = (await claimMailboxSyncJob("account-1"))!;
    await finishMailboxSyncJob("account-1", token, { hasMore });
    await expect(claimMailboxSyncJob("account-1")).rejects.toMatchObject({
      retryAfterMs: delay,
    });
    const foreground = (await claimMailboxSyncJob("account-1", {
      force: true,
    }))!;
    await finishMailboxSyncJob("account-1", foreground, { hasMore });
    vi.mocked(Date.now).mockReturnValue(1_000_000 + delay + 1);
    expect(await claimMailboxSyncJob("account-1")).toBeTruthy();
  });

  it("retains failure backoff across reloads and resets it after success", async () => {
    const token = (await claimMailboxSyncJob("account-1"))!;
    await finishMailboxSyncJob("account-1", token, {});
    vi.mocked(Date.now).mockReturnValue(1_060_001);
    const retry = (await claimMailboxSyncJob("account-1"))!;
    await finishMailboxSyncJob("account-1", retry, {});
    await expect(claimMailboxSyncJob("account-1")).rejects.toMatchObject({
      retryAfterMs: 120_000,
    });
    vi.mocked(Date.now).mockReturnValue(1_180_002);
    const successful = (await claimMailboxSyncJob("account-1"))!;
    await finishMailboxSyncJob("account-1", successful, { hasMore: false });
    expect(
      await claimMailboxSyncJob("account-1", { force: true }),
    ).toBeTruthy();
  });

  it.each([
    { hasMore: false },
    { retryAfterMs: 500_000 },
  ])("ignores completion from an expired owner before takeover: %o", async (outcome) => {
    const token = (await claimMailboxSyncJob("account-1"))!;
    const database = (await getEmailCacheDatabase())!;
    const before = await database.get("mailboxSyncJobs", "account-1");
    vi.mocked(Date.now).mockReturnValue(1_120_000);
    await finishMailboxSyncJob("account-1", token, outcome);
    expect(await database.get("mailboxSyncJobs", "account-1")).toEqual(before);
    expect(await claimMailboxSyncJob("account-1")).toBeTruthy();
  });

  it("fences an expired owner after takeover, including late writes and failures", async () => {
    const previous = (await claimMailboxSyncJob("account-1"))!;
    vi.mocked(Date.now).mockReturnValue(1_120_001);
    const current = (await claimMailboxSyncJob("account-1"))!;
    expect(await renewMailboxSyncJob("account-1", previous)).toBe(false);
    expect(
      await applyMailboxSyncPage({
        emailAccountId: "account-1",
        after: new Date(0),
        leaseToken: previous,
        page: {
          cursor: "stale",
          hasMore: false,
          reset: true,
          deletedMessageIds: [],
          upsertedMessages: [],
        },
      }),
    ).toBe(false);
    await finishMailboxSyncJob("account-1", previous, {
      retryAfterMs: 500_000,
    });
    expect(await renewMailboxSyncJob("account-1", current)).toBe(true);
    expect(
      await (await getEmailCacheDatabase())?.get(
        "mailboxSyncStates",
        "account-1",
      ),
    ).toBeUndefined();
  });

  it("rejects late writes after another tab clears the account", async () => {
    const token = (await claimMailboxSyncJob("account-1"))!;
    const database = (await getEmailCacheDatabase())!;
    // A separate tab clears durable state without changing this realm's epoch.
    await database.delete("mailboxSyncJobs", "account-1");
    expect(
      await applyMailboxSyncPage({
        emailAccountId: "account-1",
        after: new Date(0),
        leaseToken: token,
        page: {
          cursor: "late",
          hasMore: false,
          reset: true,
          deletedMessageIds: [],
          upsertedMessages: [],
        },
      }),
    ).toBe(false);
    await finishMailboxSyncJob("account-1", token, { hasMore: false });
    expect(await database.get("mailboxSyncJobs", "account-1")).toBeUndefined();
  });

  it("clears only the removed account's durable work", async () => {
    await claimMailboxSyncJob("account-1");
    await claimMailboxSyncJob("account-2");
    await clearEmailCacheForAccount("account-1");
    const database = (await getEmailCacheDatabase())!;
    expect(await database.get("mailboxSyncJobs", "account-1")).toBeUndefined();
    expect(await database.get("mailboxSyncJobs", "account-2")).toBeDefined();
    await clearEmailCache();
    expect(await database.count("mailboxSyncJobs")).toBe(0);
  });
});
