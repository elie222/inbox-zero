// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getEmailCacheDatabase } from "./database";
import { notifyMailboxStoreChange } from "./mailbox";
import { requestLocalMailSync } from "./local-mail-sync-events";
import { retainLocalMailSync } from "./local-mail-sync-runtime";
import { runLocalMailSyncTick } from "./local-mail-sync";
import { readSearchIndexWork } from "./search-index-work";
import { isSearchIndexStoragePaused } from "./search-index-service";
import { readLocalMailStorageAdmission } from "./local-mail-storage";
import { isMailSyncActivated } from "./mail-activation";
import { getInboxZeroDesktopApp } from "@/utils/desktop-app";

vi.mock("./local-mail-sync", () => ({ runLocalMailSyncTick: vi.fn() }));
vi.mock("./database", () => ({
  getEmailCacheDatabase: vi.fn(async () => ({
    getAll: async () => [{ messageBytes: 100 }, { messageBytes: 250 }],
  })),
}));
vi.mock("./search-index-seed", () => ({
  initializeSearchIndexAccount: vi.fn(async () => ({
    generation: "generation",
  })),
}));
vi.mock("./search-index-work", () => ({ readSearchIndexWork: vi.fn() }));
vi.mock("./search-index-service", () => ({
  isSearchIndexStoragePaused: vi.fn(() => false),
}));
vi.mock("./mail-activation", () => ({
  isMailSyncActivated: vi.fn(() => true),
}));
vi.mock("./mailbox", () => ({ notifyMailboxStoreChange: vi.fn() }));
vi.mock("@/utils/desktop-app", () => ({ getInboxZeroDesktopApp: vi.fn() }));
vi.mock("./local-mail-storage", () => ({
  readLocalMailStorageAdmission: vi.fn(),
  withLocalMailStorageLock: vi.fn(async (operation) => operation()),
}));
const disposers: (() => void)[] = [];

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(Date.UTC(2026, 8, 1));
  vi.clearAllMocks();
  vi.mocked(isMailSyncActivated).mockReturnValue(true);
  vi.mocked(isSearchIndexStoragePaused).mockReturnValue(false);
  vi.mocked(getInboxZeroDesktopApp).mockReturnValue(undefined);
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
  vi.stubGlobal("navigator", { onLine: true, locks: { request: vi.fn() } });
  vi.mocked(readSearchIndexWork).mockResolvedValue({
    generation: "generation",
    work: [],
    blockedCount: 0,
  });
  vi.mocked(readLocalMailStorageAdmission).mockResolvedValue({
    allowed: true,
    reason: "available",
    budgetBytes: 10_000,
    backfillLimitBytes: 9000,
    remainingBytes: 1000,
  });
  vi.mocked(runLocalMailSyncTick).mockImplementation(async () => ({
    status: "waiting",
    retryAt: Date.now() + 60_000,
  }));
});
afterEach(() => {
  for (const dispose of disposers.splice(0)) dispose();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("activated local mail runtime", () => {
  it("preserves the frozen current history stream across recovery wakeups while permitting baseline capture", async () => {
    const current = {
      kind: "current",
      request: { phase: "history-changes" },
      nextAttemptAt: Number.MAX_SAFE_INTEGER,
      attempts: 0,
    };
    const put = vi.fn();
    const database = {
      transaction: () => ({
        objectStore: (name: string) =>
          name === "localMailSyncStates"
            ? { get: async () => ({ recovering: true, nextAttemptAt: 0 }) }
            : { index: () => ({ getAll: async () => [current] }), put },
        done: Promise.resolve(),
      }),
    };
    await vi.mocked(getEmailCacheDatabase).withImplementation(
      async () => database as never,
      async () => {
        disposers.push(retainLocalMailSync("account", true));
        await vi.advanceTimersByTimeAsync(11_000);
        window.dispatchEvent(new Event("focus"));
        await vi.advanceTimersByTimeAsync(0);
        await vi.advanceTimersByTimeAsync(11_000);
        window.dispatchEvent(new Event("online"));
        await vi.advanceTimersByTimeAsync(0);
        requestLocalMailSync("account");
        await vi.advanceTimersByTimeAsync(0);
        expect(current.nextAttemptAt).toBe(Number.MAX_SAFE_INTEGER);
        expect(put).not.toHaveBeenCalled();
        current.request.phase = "history-baseline";
        requestLocalMailSync("account");
        await vi.advanceTimersByTimeAsync(0);
        expect(put).toHaveBeenCalledTimes(1);
        expect(current.nextAttemptAt).toBe(Date.now());
      },
    );
  });

  it("keeps historical list notifications from polling counts and throttles current count refreshes", async () => {
    vi.mocked(runLocalMailSyncTick).mockResolvedValue({
      status: "progress",
      phase: "history-hydrate",
    });
    disposers.push(retainLocalMailSync("account", true));
    await vi.advanceTimersByTimeAsync(5000);
    expect(notifyMailboxStoreChange).toHaveBeenCalled();
    expect(
      vi
        .mocked(notifyMailboxStoreChange)
        .mock.calls.every(([, options]) => options?.refreshCounts === false),
    ).toBe(true);
    vi.mocked(runLocalMailSyncTick).mockResolvedValue({
      status: "progress",
      phase: "history-hydrate",
      currentUpdate: true,
    });
    await vi.advanceTimersByTimeAsync(30_000);
    expect(
      vi
        .mocked(notifyMailboxStoreChange)
        .mock.calls.filter(([, options]) => options?.refreshCounts),
    ).toHaveLength(1);
    requestLocalMailSync("account");
    await vi.advanceTimersByTimeAsync(2000);
    expect(
      vi
        .mocked(notifyMailboxStoreChange)
        .mock.calls.filter(([, options]) => options?.refreshCounts),
    ).toHaveLength(2);
  });

  it("pauses history after inactivity and catches up on user activity", async () => {
    disposers.push(retainLocalMailSync("account", true));
    await vi.advanceTimersByTimeAsync(0);
    expect(
      vi.mocked(runLocalMailSyncTick).mock.calls.at(-1)?.[0]
        .allowHistoricalWork,
    ).toBe(true);
    await vi.advanceTimersByTimeAsync(5 * 60_000);
    expect(
      vi.mocked(runLocalMailSyncTick).mock.calls.at(-1)?.[0]
        .allowHistoricalWork,
    ).toBe(false);
    window.dispatchEvent(new Event("pointerdown"));
    await vi.advanceTimersByTimeAsync(0);
    expect(
      vi.mocked(runLocalMailSyncTick).mock.calls.at(-1)?.[0]
        .allowHistoricalWork,
    ).toBe(true);
  });

  it("does not download for an unactivated account and stops after release", async () => {
    vi.mocked(isMailSyncActivated).mockReturnValue(false);
    disposers.push(retainLocalMailSync("account", true));
    await vi.advanceTimersByTimeAsync(1000);
    expect(runLocalMailSyncTick).not.toHaveBeenCalled();
    vi.mocked(isMailSyncActivated).mockReturnValue(true);
    await vi.advanceTimersByTimeAsync(500);
    expect(runLocalMailSyncTick).toHaveBeenCalledTimes(1);
    disposers.pop()!();
    await vi.advanceTimersByTimeAsync(120_000);
    expect(runLocalMailSyncTick).toHaveBeenCalledTimes(1);
  });

  it("serves every account while bounding provider concurrency to two", async () => {
    const releases: (() => void)[] = [];
    vi.mocked(runLocalMailSyncTick).mockImplementation(
      () =>
        new Promise((resolve) =>
          releases.push(() =>
            resolve({ status: "progress", phase: "capabilities" }),
          ),
        ),
    );
    for (const id of ["account-1", "account-2", "account-3"])
      disposers.push(retainLocalMailSync(id, id === "account-3"));
    await vi.advanceTimersByTimeAsync(0);
    expect(runLocalMailSyncTick).toHaveBeenCalledTimes(2);
    expect(
      vi.mocked(runLocalMailSyncTick).mock.calls[0][0].emailAccountId,
    ).toBe("account-3");
    releases.shift()!();
    await vi.advanceTimersByTimeAsync(250);
    expect(runLocalMailSyncTick).toHaveBeenCalledTimes(3);
    expect(
      new Set(
        vi
          .mocked(runLocalMailSyncTick)
          .mock.calls.map(([options]) => options.emailAccountId),
      ).size,
    ).toBe(3);
    for (const release of releases) release();
    await vi.advanceTimersByTimeAsync(0);
  });

  it("keeps hidden desktop current updates but pauses historical work and hidden browser downloads", async () => {
    vi.mocked(getInboxZeroDesktopApp).mockReturnValue({} as never);
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    disposers.push(retainLocalMailSync("account", true));
    await vi.advanceTimersByTimeAsync(0);
    expect(runLocalMailSyncTick).toHaveBeenCalledWith(
      expect.objectContaining({ allowHistoricalWork: false }),
    );
    vi.mocked(getInboxZeroDesktopApp).mockReturnValue(undefined);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(runLocalMailSyncTick).toHaveBeenCalledTimes(1);
  });

  it("pauses historical intake behind indexing while retaining current sync", async () => {
    vi.mocked(isSearchIndexStoragePaused).mockReturnValue(true);
    disposers.push(retainLocalMailSync("account", true));
    await vi.advanceTimersByTimeAsync(0);
    expect(runLocalMailSyncTick).toHaveBeenCalledWith(
      expect.objectContaining({ allowHistoricalWork: false }),
    );
  });

  it("recomputes aggregate canonical allowance from fresh remaining origin bytes", async () => {
    disposers.push(retainLocalMailSync("account", true));
    await vi.advanceTimersByTimeAsync(0);
    const options = vi.mocked(runLocalMailSyncTick).mock.calls[0][0];
    const response = {
      status: "ok",
      phase: "capabilities",
      result: {
        strategy: "account-history",
        excludedFolderIds: [],
        maxHydrationMessages: 25,
      },
    } as const;
    expect(await options.admitResponse(response as never)).toEqual({
      allowed: true,
      maxCanonicalBytes: 1350,
    });
    expect(readLocalMailStorageAdmission).toHaveBeenCalledWith({
      expectedGrowthBytes: new Blob([JSON.stringify(response)]).size,
    });
    vi.mocked(readLocalMailStorageAdmission).mockResolvedValueOnce({
      allowed: false,
      reason: "storage-full",
      budgetBytes: 10_000,
      backfillLimitBytes: 9000,
      remainingBytes: 0,
    });
    expect(await options.admitResponse(response as never)).toEqual({
      allowed: false,
      maxCanonicalBytes: 350,
    });
  });
});
