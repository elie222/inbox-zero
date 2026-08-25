// @vitest-environment jsdom

import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ThreadPrefetchCoordinator } from "./thread-prefetch-coordinator";
import {
  HOVER_PREFETCH_DELAY_MS,
  useHoverThreadPrefetch,
} from "./use-hover-thread-prefetch";
describe("useHoverThreadPrefetch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("schedules a hover prefetch only after the dwell delay", async () => {
    const coordinator = createCoordinator();
    const { result } = renderHook(() =>
      useHoverThreadPrefetch({
        coordinator,
        scopeKey: "scope-dwell",
      }),
    );

    result.current.schedulePrefetch({
      emailAccountId: "account-dwell",
      threadId: "thread-1",
    });
    await vi.advanceTimersByTimeAsync(HOVER_PREFETCH_DELAY_MS - 1);
    expect(coordinator.schedule).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(coordinator.schedule).toHaveBeenCalledWith({
      emailAccountId: "account-dwell",
      priority: "hover",
      scopeKey: "scope-dwell",
      threadId: "thread-1",
    });
  });

  it("does not schedule when the pointer leaves before the delay", async () => {
    const coordinator = createCoordinator();
    const { result } = renderHook(() =>
      useHoverThreadPrefetch({
        coordinator,
        scopeKey: "scope-leave",
      }),
    );

    result.current.schedulePrefetch({
      emailAccountId: "account-leave",
      threadId: "thread-1",
    });
    await vi.advanceTimersByTimeAsync(HOVER_PREFETCH_DELAY_MS - 10);
    result.current.cancelPrefetch();
    await vi.advanceTimersByTimeAsync(1000);

    expect(coordinator.schedule).not.toHaveBeenCalled();
  });

  it("keeps only the latest hover intent while sweeping rows", async () => {
    const coordinator = createCoordinator();
    const { result } = renderHook(() =>
      useHoverThreadPrefetch({
        coordinator,
        scopeKey: "scope-sweep",
      }),
    );

    result.current.schedulePrefetch({
      emailAccountId: "account-sweep",
      threadId: "thread-1",
    });
    await vi.advanceTimersByTimeAsync(HOVER_PREFETCH_DELAY_MS - 10);
    result.current.schedulePrefetch({
      emailAccountId: "account-combined-row",
      threadId: "thread-2",
    });
    await vi.advanceTimersByTimeAsync(HOVER_PREFETCH_DELAY_MS);

    expect(coordinator.schedule).toHaveBeenCalledTimes(1);
    expect(coordinator.schedule).toHaveBeenCalledWith({
      emailAccountId: "account-combined-row",
      priority: "hover",
      scopeKey: "scope-sweep",
      threadId: "thread-2",
    });
  });

  it("cancels the scope on cleanup", () => {
    const coordinator = createCoordinator();
    const { result, unmount } = renderHook(() =>
      useHoverThreadPrefetch({
        coordinator,
        scopeKey: "scope-cleanup",
      }),
    );

    result.current.schedulePrefetch({
      emailAccountId: "account-cleanup",
      threadId: "thread-1",
    });
    unmount();

    expect(coordinator.cancelScope).toHaveBeenCalledWith("scope-cleanup");
    expect(coordinator.schedule).not.toHaveBeenCalled();
  });
});

function createCoordinator(): ThreadPrefetchCoordinator {
  return {
    activate: vi.fn(),
    cancelScope: vi.fn(),
    dispose: vi.fn(),
    schedule: vi.fn(),
    scheduleMany: vi.fn(),
  };
}
