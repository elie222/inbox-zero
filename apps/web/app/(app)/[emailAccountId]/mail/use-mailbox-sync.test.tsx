// @vitest-environment jsdom

import { MailboxSyncDeferredError } from "@/utils/email-cache/mailbox-sync-job";
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  requestMailboxSync,
  syncMailboxNow,
  useMailboxSync,
} from "./use-mailbox-sync";

const activation = vi.hoisted(() => ({ isActivated: vi.fn() }));

const desktop = vi.hoisted(() => ({ getApp: vi.fn() }));
const mailboxSync = vi.hoisted(() => ({
  fetchPage: vi.fn(),
  syncPages: vi.fn(),
}));
const analytics = vi.hoisted(() => ({
  trackSyncResult: vi.fn(),
}));

vi.mock("@/utils/email-cache/mail-activation", () => ({
  isMailSyncActivated: activation.isActivated,
}));
vi.mock("@/utils/email-cache/mailbox-sync", () => ({
  fetchMailboxSyncPage: mailboxSync.fetchPage,
  syncMailboxPages: mailboxSync.syncPages,
}));
vi.mock("@/utils/email-cache/analytics", () => ({
  trackMailboxSyncResult: analytics.trackSyncResult,
}));
vi.mock("@/utils/desktop-app", () => ({
  getInboxZeroDesktopApp: desktop.getApp,
}));

const onlineDescriptor = Object.getOwnPropertyDescriptor(navigator, "onLine");
const visibilityDescriptor = Object.getOwnPropertyDescriptor(
  document,
  "visibilityState",
);

describe("useMailboxSync", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    activation.isActivated.mockReturnValue(true);
    setOnline(true);
    setVisibility("visible");
    desktop.getApp.mockReturnValue(undefined);
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    mailboxSync.syncPages.mockResolvedValue({
      hasMore: false,
      pagesSynced: 1,
    });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
    restoreProperty(navigator, "onLine", onlineDescriptor);
    restoreProperty(document, "visibilityState", visibilityDescriptor);
  });

  it("continues an incomplete sync quickly, then settles to polling", async () => {
    mailboxSync.syncPages
      .mockResolvedValueOnce({ hasMore: true, pagesSynced: 1 })
      .mockResolvedValue({ hasMore: false, pagesSynced: 1 });

    renderHook(() =>
      useMailboxSync({ emailAccountId: "account-1", enabled: true }),
    );
    expect(mailboxSync.syncPages).toHaveBeenCalledOnce();
    expect(mailboxSync.syncPages).toHaveBeenCalledWith({
      emailAccountId: "account-1",
      fetchPage: expect.any(Function),
      maxPages: 1,
      force: false,
    });
    await settlePromises();

    await act(() => vi.advanceTimersByTimeAsync(9999));
    expect(mailboxSync.syncPages).toHaveBeenCalledOnce();
    await act(() => vi.advanceTimersByTimeAsync(1));
    expect(mailboxSync.syncPages).toHaveBeenCalledTimes(2);

    await settlePromises();
    await act(() => vi.advanceTimersByTimeAsync(59_999));
    expect(mailboxSync.syncPages).toHaveBeenCalledTimes(2);
    await act(() => vi.advanceTimersByTimeAsync(1));
    expect(mailboxSync.syncPages).toHaveBeenCalledTimes(3);
  });

  it("pauses offline work and resumes on browser events", async () => {
    setOnline(false);
    renderHook(() =>
      useMailboxSync({ emailAccountId: "account-1", enabled: true }),
    );
    expect(mailboxSync.syncPages).not.toHaveBeenCalled();

    await act(() => vi.advanceTimersByTimeAsync(60_000));
    expect(mailboxSync.syncPages).not.toHaveBeenCalled();

    setOnline(true);
    act(() => window.dispatchEvent(new Event("online")));
    expect(mailboxSync.syncPages).toHaveBeenCalledOnce();
    await settlePromises();
  });

  it("pauses hidden polling in the web app until the tab is visible again", async () => {
    renderHook(() =>
      useMailboxSync({ emailAccountId: "account-1", enabled: true }),
    );
    expect(mailboxSync.syncPages).toHaveBeenCalledOnce();
    await settlePromises();

    setVisibility("hidden");
    act(() => window.dispatchEvent(new Event("focus")));
    expect(mailboxSync.syncPages).toHaveBeenCalledOnce();

    setVisibility("visible");
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(mailboxSync.syncPages).toHaveBeenCalledTimes(2);
  });

  it("continues hidden polling in the desktop app", async () => {
    desktop.getApp.mockReturnValue({
      startAuth: vi.fn(),
    });
    setVisibility("hidden");

    renderHook(() =>
      useMailboxSync({ emailAccountId: "account-1", enabled: true }),
    );
    expect(mailboxSync.syncPages).toHaveBeenCalledOnce();
    await settlePromises();

    await act(() => vi.advanceTimersByTimeAsync(59_999));
    expect(mailboxSync.syncPages).toHaveBeenCalledOnce();
    await act(() => vi.advanceTimersByTimeAsync(1));
    expect(mailboxSync.syncPages).toHaveBeenCalledTimes(2);
  });

  it("deduplicates account syncs and queues one rerun requested in flight", async () => {
    const pending = Promise.withResolvers<{
      hasMore: boolean;
      pagesSynced: number;
    }>();
    const rerun = Promise.withResolvers<{
      hasMore: boolean;
      pagesSynced: number;
    }>();
    mailboxSync.syncPages
      .mockReturnValueOnce(pending.promise)
      .mockReturnValueOnce(rerun.promise);

    renderHook(() =>
      useMailboxSync({ emailAccountId: "account-1", enabled: true }),
    );
    renderHook(() =>
      useMailboxSync({ emailAccountId: "account-1", enabled: true }),
    );
    expect(mailboxSync.syncPages).toHaveBeenCalledOnce();

    act(() => requestMailboxSync("another-account"));
    act(() => requestMailboxSync("account-1"));
    expect(mailboxSync.syncPages).toHaveBeenCalledOnce();

    pending.resolve({ hasMore: false, pagesSynced: 1 });
    await settlePromises();
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(mailboxSync.syncPages).toHaveBeenCalledTimes(2);

    expect(mailboxSync.syncPages).toHaveBeenLastCalledWith(
      expect.objectContaining({ emailAccountId: "account-1", force: true }),
    );
    rerun.resolve({ hasMore: false, pagesSynced: 1 });
    await settlePromises();
  });

  it("runs an awaited mailbox reconciliation after existing account work", async () => {
    const existing = Promise.withResolvers<{
      hasMore: boolean;
      pagesSynced: number;
    }>();
    const reconciliation = Promise.withResolvers<{
      hasMore: boolean;
      pagesSynced: number;
    }>();
    mailboxSync.syncPages
      .mockReturnValueOnce(existing.promise)
      .mockReturnValueOnce(reconciliation.promise);

    const first = syncMailboxNow("account-1");
    const fresh = syncMailboxNow("account-1");
    expect(mailboxSync.syncPages).toHaveBeenCalledOnce();

    existing.resolve({ hasMore: false, pagesSynced: 1 });
    await expect(first).resolves.toEqual({ hasMore: false, pagesSynced: 1 });
    await settlePromises();
    expect(mailboxSync.syncPages).toHaveBeenCalledTimes(2);

    expect(mailboxSync.syncPages).toHaveBeenLastCalledWith(
      expect.objectContaining({ emailAccountId: "account-1", force: true }),
    );
    reconciliation.resolve({ hasMore: false, pagesSynced: 1 });
    await expect(fresh).resolves.toEqual({ hasMore: false, pagesSynced: 1 });
  });

  it("waits for durable deferrals without reporting a failure or increasing backoff", async () => {
    mailboxSync.syncPages
      .mockRejectedValueOnce(new MailboxSyncDeferredError(20_000))
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValue({ hasMore: false, pagesSynced: 1 });
    renderHook(() =>
      useMailboxSync({ emailAccountId: "account-1", enabled: true }),
    );
    await settlePromises();
    expect(analytics.trackSyncResult).not.toHaveBeenCalled();
    await act(() => vi.advanceTimersByTimeAsync(19_999));
    expect(mailboxSync.syncPages).toHaveBeenCalledOnce();
    await act(() => vi.advanceTimersByTimeAsync(1));
    await settlePromises();
    expect(analytics.trackSyncResult).toHaveBeenLastCalledWith(
      expect.objectContaining({ consecutiveFailures: 1, retryDelayMs: 60_000 }),
    );
  });

  it("drops queued background work when disabled before it starts", async () => {
    const first = Promise.withResolvers<{
      hasMore: boolean;
      pagesSynced: number;
    }>();
    const second = Promise.withResolvers<{
      hasMore: boolean;
      pagesSynced: number;
    }>();
    mailboxSync.syncPages
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    renderHook(() =>
      useMailboxSync({ emailAccountId: "blocker-1", enabled: true }),
    );
    renderHook(() =>
      useMailboxSync({ emailAccountId: "blocker-2", enabled: true }),
    );
    const queued = renderHook(
      ({ enabled }) => useMailboxSync({ emailAccountId: "account-1", enabled }),
      { initialProps: { enabled: true } },
    );
    queued.rerender({ enabled: false });
    first.resolve({ hasMore: false, pagesSynced: 1 });
    second.resolve({ hasMore: false, pagesSynced: 1 });
    await settlePromises();
    expect(mailboxSync.syncPages).toHaveBeenCalledTimes(2);
  });

  it("drops queued work after another tab revokes activation before React cleanup", async () => {
    const first = Promise.withResolvers<{
      hasMore: boolean;
      pagesSynced: number;
    }>();
    const second = Promise.withResolvers<{
      hasMore: boolean;
      pagesSynced: number;
    }>();
    mailboxSync.syncPages
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    renderHook(() =>
      useMailboxSync({ emailAccountId: "blocker-1", enabled: true }),
    );
    renderHook(() =>
      useMailboxSync({ emailAccountId: "blocker-2", enabled: true }),
    );
    renderHook(() =>
      useMailboxSync({ emailAccountId: "account-1", enabled: true }),
    );
    activation.isActivated.mockImplementation(
      (id: string) => id !== "account-1",
    );
    first.resolve({ hasMore: false, pagesSynced: 1 });
    second.resolve({ hasMore: false, pagesSynced: 1 });
    await settlePromises();
    expect(mailboxSync.syncPages).toHaveBeenCalledTimes(2);
    await syncMailboxNow("account-1");
    expect(mailboxSync.syncPages).toHaveBeenLastCalledWith(
      expect.objectContaining({ emailAccountId: "account-1", force: true }),
    );
  });

  it("backs off repeated failures and resets after recovery", async () => {
    mailboxSync.syncPages
      .mockRejectedValueOnce(new Error("offline"))
      .mockRejectedValueOnce(new Error("still offline"))
      .mockResolvedValueOnce({ hasMore: false, pagesSynced: 1 })
      .mockRejectedValueOnce(new Error("offline again"))
      .mockResolvedValue({ hasMore: false, pagesSynced: 1 });
    renderHook(() =>
      useMailboxSync({ emailAccountId: "account-1", enabled: true }),
    );
    await settlePromises();

    await act(() => vi.advanceTimersByTimeAsync(59_999));
    expect(mailboxSync.syncPages).toHaveBeenCalledOnce();
    await act(() => vi.advanceTimersByTimeAsync(1));
    expect(mailboxSync.syncPages).toHaveBeenCalledTimes(2);

    await settlePromises();
    await act(() => vi.advanceTimersByTimeAsync(119_999));
    expect(mailboxSync.syncPages).toHaveBeenCalledTimes(2);
    await act(() => vi.advanceTimersByTimeAsync(1));
    expect(mailboxSync.syncPages).toHaveBeenCalledTimes(3);

    await settlePromises();
    await act(() => vi.advanceTimersByTimeAsync(60_000));
    expect(mailboxSync.syncPages).toHaveBeenCalledTimes(4);
    await settlePromises();
    await act(() => vi.advanceTimersByTimeAsync(59_999));
    expect(mailboxSync.syncPages).toHaveBeenCalledTimes(4);
    await act(() => vi.advanceTimersByTimeAsync(1));
    expect(mailboxSync.syncPages).toHaveBeenCalledTimes(5);
  });

  it("keeps retry backoff when account priority changes", async () => {
    mailboxSync.syncPages
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValue({ hasMore: false, pagesSynced: 1 });
    const { rerender } = renderHook(
      ({ priority }) =>
        useMailboxSync({
          emailAccountId: "account-1",
          enabled: true,
          priority,
        }),
      { initialProps: { priority: false } },
    );
    await settlePromises();

    rerender({ priority: true });
    await settlePromises();
    expect(mailboxSync.syncPages).toHaveBeenCalledOnce();

    await act(() => vi.advanceTimersByTimeAsync(59_999));
    expect(mailboxSync.syncPages).toHaveBeenCalledOnce();
    await act(() => vi.advanceTimersByTimeAsync(1));
    expect(mailboxSync.syncPages).toHaveBeenCalledTimes(2);
  });

  it("jitters retry schedules to avoid synchronized clients", async () => {
    vi.mocked(Math.random).mockReturnValue(0);
    mailboxSync.syncPages
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValue({ hasMore: false, pagesSynced: 1 });

    renderHook(() =>
      useMailboxSync({ emailAccountId: "account-1", enabled: true }),
    );
    await settlePromises();

    await act(() => vi.advanceTimersByTimeAsync(47_999));
    expect(mailboxSync.syncPages).toHaveBeenCalledOnce();
    await act(() => vi.advanceTimersByTimeAsync(1));
    expect(mailboxSync.syncPages).toHaveBeenCalledTimes(2);
  });

  it("keeps jittered exponential backoff within the configured cap", async () => {
    vi.mocked(Math.random).mockReturnValue(1);
    mailboxSync.syncPages.mockRejectedValue(new Error("offline"));

    renderHook(() =>
      useMailboxSync({ emailAccountId: "account-1", enabled: true }),
    );
    await settlePromises();

    for (const retryDelayMs of [72_000, 144_000, 288_000, 576_000]) {
      await act(() => vi.advanceTimersByTimeAsync(retryDelayMs));
      await settlePromises();
    }

    expect(analytics.trackSyncResult).toHaveBeenLastCalledWith(
      expect.objectContaining({
        consecutiveFailures: 5,
        retryDelayMs: 15 * 60_000,
      }),
    );
    await act(() => vi.advanceTimersByTimeAsync(15 * 60_000 - 1));
    expect(mailboxSync.syncPages).toHaveBeenCalledTimes(5);
    await act(() => vi.advanceTimersByTimeAsync(1));
    expect(mailboxSync.syncPages).toHaveBeenCalledTimes(6);
  });

  it("uses an API retry delay when it is longer than exponential backoff", async () => {
    vi.mocked(Math.random).mockReturnValue(0);
    mailboxSync.syncPages
      .mockRejectedValueOnce(
        Object.assign(new Error("busy"), { retryAfterMs: 90_000 }),
      )
      .mockResolvedValue({ hasMore: false, pagesSynced: 1 });

    renderHook(() =>
      useMailboxSync({ emailAccountId: "account-1", enabled: true }),
    );
    await settlePromises();

    await act(() => vi.advanceTimersByTimeAsync(89_999));
    expect(mailboxSync.syncPages).toHaveBeenCalledOnce();
    await act(() => vi.advanceTimersByTimeAsync(1));
    expect(mailboxSync.syncPages).toHaveBeenCalledTimes(2);
  });

  it("tracks the initial sync, catch-up completion, and retry outcome", async () => {
    mailboxSync.syncPages
      .mockResolvedValueOnce({ hasMore: true, pagesSynced: 1 })
      .mockResolvedValueOnce({ hasMore: false, pagesSynced: 1 })
      .mockRejectedValueOnce(new Error("offline"));

    renderHook(() =>
      useMailboxSync({ emailAccountId: "account-1", enabled: true }),
    );
    await settlePromises();
    expect(analytics.trackSyncResult).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        hasMore: true,
        outcome: "success",
        pagesSynced: 1,
        phase: "initial",
      }),
    );

    await act(() => vi.advanceTimersByTimeAsync(10_000));
    await settlePromises();
    expect(analytics.trackSyncResult).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        hasMore: false,
        outcome: "success",
        phase: "catch_up_complete",
      }),
    );

    await act(() => vi.advanceTimersByTimeAsync(60_000));
    await settlePromises();
    expect(analytics.trackSyncResult).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        consecutiveFailures: 1,
        outcome: "failure",
        phase: "retry",
        retryDelayMs: 60_000,
      }),
    );
  });
});

async function settlePromises() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

function setOnline(online: boolean) {
  Object.defineProperty(navigator, "onLine", {
    configurable: true,
    value: online,
  });
}

function setVisibility(visibilityState: DocumentVisibilityState) {
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    value: visibilityState,
  });
}

function restoreProperty(
  target: object,
  property: PropertyKey,
  descriptor: PropertyDescriptor | undefined,
) {
  if (descriptor) {
    Object.defineProperty(target, property, descriptor);
  } else {
    Reflect.deleteProperty(target, property);
  }
}
