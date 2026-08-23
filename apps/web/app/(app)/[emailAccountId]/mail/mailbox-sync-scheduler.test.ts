import { describe, expect, it, vi } from "vitest";
import { createMailboxSyncScheduler } from "./mailbox-sync-scheduler";

const SYNC_RESULT = { hasMore: false, pagesSynced: 1 };

describe("mailbox sync scheduler", () => {
  it("caps concurrency and runs a queued priority account first", async () => {
    const pending = new Map<
      string,
      ReturnType<typeof Promise.withResolvers<typeof SYNC_RESULT>>
    >();
    const started: string[] = [];
    let active = 0;
    let peakActive = 0;
    const sync = vi.fn((emailAccountId: string) => {
      started.push(emailAccountId);
      active += 1;
      peakActive = Math.max(peakActive, active);
      const result = Promise.withResolvers<typeof SYNC_RESULT>();
      pending.set(emailAccountId, result);
      return result.promise.finally(() => {
        active -= 1;
      });
    });
    const scheduler = createMailboxSyncScheduler({ maxConcurrent: 2, sync });

    const first = scheduler.run({ emailAccountId: "account-1" });
    const second = scheduler.run({ emailAccountId: "account-2" });
    const third = scheduler.run({ emailAccountId: "account-3" });
    const priority = scheduler.run({ emailAccountId: "active-account" });
    scheduler.setPriority({
      emailAccountId: "active-account",
      priority: true,
    });

    expect(started).toEqual(["account-1", "account-2"]);

    pending.get("account-1")?.resolve(SYNC_RESULT);
    await settlePromises();
    expect(started).toEqual(["account-1", "account-2", "active-account"]);

    pending.get("account-2")?.resolve(SYNC_RESULT);
    await settlePromises();
    expect(started).toEqual([
      "account-1",
      "account-2",
      "active-account",
      "account-3",
    ]);

    pending.get("active-account")?.resolve(SYNC_RESULT);
    pending.get("account-3")?.resolve(SYNC_RESULT);
    await Promise.all([first, second, third, priority]);
    expect(peakActive).toBe(2);
  });

  it("deduplicates queued and running work by account", async () => {
    const pending = new Map<
      string,
      ReturnType<typeof Promise.withResolvers<typeof SYNC_RESULT>>
    >();
    const sync = vi.fn((emailAccountId: string) => {
      const result = Promise.withResolvers<typeof SYNC_RESULT>();
      pending.set(emailAccountId, result);
      return result.promise;
    });
    const scheduler = createMailboxSyncScheduler({ maxConcurrent: 1, sync });

    const blocker = scheduler.run({ emailAccountId: "blocker" });
    const first = scheduler.run({ emailAccountId: "account-1" });
    const duplicate = scheduler.run({
      emailAccountId: "account-1",
      priority: true,
    });

    expect(duplicate).toBe(first);
    expect(sync).toHaveBeenCalledOnce();

    pending.get("blocker")?.resolve(SYNC_RESULT);
    await settlePromises();
    expect(sync).toHaveBeenCalledTimes(2);

    pending.get("account-1")?.resolve(SYNC_RESULT);
    await Promise.all([blocker, first, duplicate]);
  });

  it("reprioritizes queued work when the active account changes", async () => {
    const pending = new Map<
      string,
      ReturnType<typeof Promise.withResolvers<typeof SYNC_RESULT>>
    >();
    const started: string[] = [];
    const sync = vi.fn((emailAccountId: string) => {
      started.push(emailAccountId);
      const result = Promise.withResolvers<typeof SYNC_RESULT>();
      pending.set(emailAccountId, result);
      return result.promise;
    });
    const scheduler = createMailboxSyncScheduler({ maxConcurrent: 1, sync });

    const blocker = scheduler.run({ emailAccountId: "blocker" });
    const oldActive = scheduler.run({
      emailAccountId: "old-active",
      priority: true,
    });
    const newActive = scheduler.run({ emailAccountId: "new-active" });

    scheduler.setPriority({ emailAccountId: "old-active", priority: false });
    scheduler.setPriority({ emailAccountId: "new-active", priority: true });

    pending.get("blocker")?.resolve(SYNC_RESULT);
    await settlePromises();
    expect(started).toEqual(["blocker", "new-active"]);

    pending.get("new-active")?.resolve(SYNC_RESULT);
    await settlePromises();
    pending.get("old-active")?.resolve(SYNC_RESULT);
    await Promise.all([blocker, oldActive, newActive]);
  });

  it("releases capacity after a failure", async () => {
    const first = Promise.withResolvers<typeof SYNC_RESULT>();
    const second = Promise.withResolvers<typeof SYNC_RESULT>();
    const sync = vi
      .fn()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const scheduler = createMailboxSyncScheduler({ maxConcurrent: 1, sync });

    const failed = scheduler.run({ emailAccountId: "account-1" });
    const next = scheduler.run({ emailAccountId: "account-2" });
    expect(sync).toHaveBeenCalledOnce();

    first.reject(new Error("offline"));
    await expect(failed).rejects.toThrow("offline");
    await settlePromises();
    expect(sync).toHaveBeenCalledTimes(2);

    second.resolve(SYNC_RESULT);
    await expect(next).resolves.toEqual(SYNC_RESULT);
  });
});

function settlePromises(iterations = 10): Promise<void> {
  if (iterations === 0) return Promise.resolve();
  return Promise.resolve().then(() => settlePromises(iterations - 1));
}
