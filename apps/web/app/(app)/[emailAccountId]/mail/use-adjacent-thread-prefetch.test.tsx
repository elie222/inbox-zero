// @vitest-environment jsdom

import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ThreadPrefetchCoordinator } from "./thread-prefetch-coordinator";
import { useAdjacentThreadPrefetch } from "./use-adjacent-thread-prefetch";
describe("useAdjacentThreadPrefetch", () => {
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

  it("schedules only the previous and next thread ids", () => {
    const coordinator = createCoordinator();

    renderHook(() =>
      useAdjacentThreadPrefetch({
        coordinator,
        currentThread: target("account-1", "thread-2"),
        scopeKey: "scope-adjacent",
        threads: [
          target("account-1", "thread-1"),
          target("account-1", "thread-2"),
          target("account-1", "thread-3"),
          target("account-1", "thread-4"),
        ],
      }),
    );

    expect(coordinator.scheduleMany).toHaveBeenCalledWith([
      {
        emailAccountId: "account-1",
        scopeKey: "scope-adjacent",
        threadId: "thread-1",
      },
      {
        emailAccountId: "account-1",
        scopeKey: "scope-adjacent",
        threadId: "thread-3",
      },
    ]);
  });

  it("uses each adjacent combined row's owning account", () => {
    const coordinator = createCoordinator();

    renderHook(() =>
      useAdjacentThreadPrefetch({
        coordinator,
        currentThread: target("account-2", "shared-thread"),
        scopeKey: "scope-combined",
        threads: [
          target("account-1", "shared-thread"),
          target("account-2", "shared-thread"),
          target("account-3", "shared-thread"),
        ],
      }),
    );

    expect(coordinator.scheduleMany).toHaveBeenCalledWith([
      {
        emailAccountId: "account-1",
        scopeKey: "scope-combined",
        threadId: "shared-thread",
      },
      {
        emailAccountId: "account-3",
        scopeKey: "scope-combined",
        threadId: "shared-thread",
      },
    ]);
  });

  it("does nothing when the current thread is missing from the list", () => {
    const coordinator = createCoordinator();

    renderHook(() =>
      useAdjacentThreadPrefetch({
        coordinator,
        currentThread: target("missing-account", "missing"),
        scopeKey: "scope-missing",
        threads: [
          target("account-1", "thread-1"),
          target("account-1", "thread-2"),
          target("account-1", "thread-3"),
        ],
      }),
    );

    expect(coordinator.scheduleMany).not.toHaveBeenCalled();
  });

  it("cancels the adjacent scope on cleanup", () => {
    const coordinator = createCoordinator();
    const { unmount } = renderHook(() =>
      useAdjacentThreadPrefetch({
        coordinator,
        currentThread: target("account-1", "thread-2"),
        scopeKey: "scope-cleanup",
        threads: [
          target("account-1", "thread-1"),
          target("account-1", "thread-2"),
          target("account-1", "thread-3"),
        ],
      }),
    );

    unmount();

    expect(coordinator.cancelScope).toHaveBeenCalledWith("scope-cleanup");
    expect(coordinator.cancelScope).toHaveBeenCalledTimes(2);
  });
});

function target(emailAccountId: string, threadId: string) {
  return { emailAccountId, threadId };
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
