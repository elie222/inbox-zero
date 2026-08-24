// @vitest-environment jsdom

import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ThreadPrefetchCoordinator } from "./thread-prefetch-coordinator";
import { usePredictiveThreadPrefetch } from "./use-predictive-thread-prefetch";
import type { ListThread } from "./types";

describe("usePredictiveThreadPrefetch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(window, "requestIdleCallback", {
      configurable: true,
      value: (callback: IdleRequestCallback) => {
        callback({ didTimeout: false, timeRemaining: () => 50 });
        return 1;
      },
    });
    Object.defineProperty(window, "cancelIdleCallback", {
      configurable: true,
      value: vi.fn(),
    });
  });

  it("schedules the focused row first and a tiny nearby window in list mode", () => {
    const coordinator = createCoordinator();

    renderHook(() =>
      usePredictiveThreadPrefetch({
        coordinator,
        emailAccountId: "account-1",
        enabled: true,
        focusedIndex: 1,
        scopeKey: "scope-predictive",
        threads: [
          createThread("thread-1"),
          createThread("thread-2"),
          createThread("thread-3"),
        ],
      }),
    );

    expect(coordinator.scheduleMany).toHaveBeenCalledWith([
      {
        emailAccountId: "account-1",
        priority: "nearby",
        scopeKey: "scope-predictive",
        threadId: "thread-1",
      },
      {
        emailAccountId: "account-1",
        priority: "focused",
        scopeKey: "scope-predictive",
        threadId: "thread-2",
      },
      {
        emailAccountId: "account-1",
        priority: "nearby",
        scopeKey: "scope-predictive",
        threadId: "thread-3",
      },
    ]);
  });

  it("skips combined-account rows and disabled list states", () => {
    const coordinator = createCoordinator();

    renderHook(() =>
      usePredictiveThreadPrefetch({
        coordinator,
        emailAccountId: "account-1",
        enabled: false,
        focusedIndex: 0,
        scopeKey: "scope-disabled",
        threads: [
          createCombinedThread("account-2", "thread-1"),
          createThread("thread-2"),
        ],
      }),
    );

    expect(coordinator.scheduleMany).not.toHaveBeenCalled();
  });

  it("cancels the predictive scope on cleanup", () => {
    const coordinator = createCoordinator();
    const { unmount } = renderHook(() =>
      usePredictiveThreadPrefetch({
        coordinator,
        emailAccountId: "account-1",
        enabled: true,
        focusedIndex: 0,
        scopeKey: "scope-cleanup",
        threads: [createThread("thread-1")],
      }),
    );

    unmount();

    expect(coordinator.cancelScope).toHaveBeenCalledWith("scope-cleanup");
  });
});

function createThread(id: string): ListThread {
  return {
    id,
    messages: [
      {
        date: "2026-08-20T10:00:00.000Z",
        headers: { from: "Sender <sender@example.com>", subject: id },
        id: `${id}-message`,
        internalDate: "2026-08-20T10:00:00.000Z",
        labelIds: ["INBOX"],
        snippet: id,
        subject: id,
        threadId: id,
      },
    ],
    plan: undefined,
    plans: [],
    snippet: id,
  };
}

function createCombinedThread(accountId: string, id: string): ListThread {
  return {
    ...createThread(id),
    account: {
      email: `${accountId}@example.com`,
      id: accountId,
      image: null,
      name: accountId,
    },
  };
}

function createCoordinator(): ThreadPrefetchCoordinator {
  return {
    activate: vi.fn(),
    cancelScope: vi.fn(),
    dispose: vi.fn(),
    schedule: vi.fn(),
    scheduleMany: vi.fn(),
  };
}
