// @vitest-environment jsdom

import type { ReactNode } from "react";
import { renderHook, waitFor } from "@testing-library/react";
import { SWRConfig } from "swr";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAdjacentThreadPrefetch } from "./use-adjacent-thread-prefetch";

const cache = vi.hoisted(() => ({
  read: vi.fn(),
  write: vi.fn(),
}));

vi.mock("@/utils/email-cache/threads", () => ({
  readCachedThread: cache.read,
  writeCachedThread: cache.write,
}));

describe("useAdjacentThreadPrefetch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cache.read.mockResolvedValue(undefined);
    cache.write.mockResolvedValue(undefined);
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

  it("prefetches only the previous and next conversations", async () => {
    const fetcher = vi.fn((key: [string, string]) =>
      Promise.resolve({ thread: { id: key[0], messages: [] } }),
    );

    renderHook(
      () =>
        useAdjacentThreadPrefetch({
          currentThreadId: "thread-2",
          emailAccountId: "account-1",
          threadIds: ["thread-1", "thread-2", "thread-3", "thread-4"],
        }),
      { wrapper: createWrapper(fetcher) },
    );

    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
    expect(fetcher.mock.calls.map(([key]) => key[0])).toEqual([
      "/api/threads/thread-1?includeDrafts=true",
      "/api/threads/thread-3?includeDrafts=true",
    ]);
  });

  it("hydrates adjacent SWR entries from disk without a request", async () => {
    cache.read.mockResolvedValue({
      data: { thread: { id: "cached", messages: [] } },
    });
    const fetcher = vi.fn();

    renderHook(
      () =>
        useAdjacentThreadPrefetch({
          currentThreadId: "thread-2",
          emailAccountId: "account-1",
          threadIds: ["thread-1", "thread-2", "thread-3"],
        }),
      { wrapper: createWrapper(fetcher) },
    );

    await waitFor(() => expect(cache.read).toHaveBeenCalledTimes(2));
    expect(fetcher).not.toHaveBeenCalled();
  });
});

function createWrapper(fetcher: (key: [string, string]) => unknown) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <SWRConfig value={{ fetcher, provider: () => new Map() }}>
        {children}
      </SWRConfig>
    );
  };
}
