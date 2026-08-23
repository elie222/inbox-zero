// @vitest-environment jsdom

import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { requestMailboxSync, useMailboxSync } from "./use-mailbox-sync";

const mailboxSync = vi.hoisted(() => ({
  fetchPage: vi.fn(),
  syncPages: vi.fn(),
}));
const analytics = vi.hoisted(() => ({
  trackSyncResult: vi.fn(),
}));

vi.mock("@/utils/email-cache/mailbox-sync", () => ({
  fetchMailboxSyncPage: mailboxSync.fetchPage,
  syncMailboxPages: mailboxSync.syncPages,
}));
vi.mock("@/utils/email-cache/analytics", () => ({
  trackMailboxSyncResult: analytics.trackSyncResult,
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
    setOnline(true);
    setVisibility("visible");
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

  it("pauses offline or hidden work and resumes on browser events", async () => {
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

    setVisibility("hidden");
    act(() => window.dispatchEvent(new Event("focus")));
    expect(mailboxSync.syncPages).toHaveBeenCalledOnce();

    setVisibility("visible");
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    await act(() => vi.advanceTimersByTimeAsync(0));
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

    rerun.resolve({ hasMore: false, pagesSynced: 1 });
    await settlePromises();
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
