// @vitest-environment jsdom

import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
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
        currentThreadId: "thread-2",
        emailAccountId: "account-1",
        scopeKey: "scope-adjacent",
        threadIds: ["thread-1", "thread-2", "thread-3", "thread-4"],
      }),
    );

    expect(coordinator.scheduleMany).toHaveBeenCalledWith([
      {
        emailAccountId: "account-1",
        priority: "adjacent",
        scopeKey: "scope-adjacent",
        threadId: "thread-1",
      },
      {
        emailAccountId: "account-1",
        priority: "adjacent",
        scopeKey: "scope-adjacent",
        threadId: "thread-3",
      },
    ]);
  });

  it("does nothing when the current thread is missing from the list", () => {
    const coordinator = createCoordinator();

    renderHook(() =>
      useAdjacentThreadPrefetch({
        coordinator,
        currentThreadId: "missing",
        emailAccountId: "account-1",
        scopeKey: "scope-missing",
        threadIds: ["thread-1", "thread-2", "thread-3"],
      }),
    );

    expect(coordinator.scheduleMany).not.toHaveBeenCalled();
  });

  it("cancels the adjacent scope on cleanup", () => {
    const coordinator = createCoordinator();
    const { unmount } = renderHook(() =>
      useAdjacentThreadPrefetch({
        coordinator,
        currentThreadId: "thread-2",
        emailAccountId: "account-1",
        scopeKey: "scope-cleanup",
        threadIds: ["thread-1", "thread-2", "thread-3"],
      }),
    );

    unmount();

    expect(coordinator.cancelScope).toHaveBeenCalledWith("scope-cleanup");
    expect(coordinator.cancelScope).toHaveBeenCalledTimes(2);
  });
});

function createCoordinator() {
  return {
    cancelScope: vi.fn(),
    dispose: vi.fn(),
    schedule: vi.fn(),
    scheduleMany: vi.fn(),
  };
}
