// @vitest-environment jsdom

import type { ReactNode } from "react";
import { renderHook } from "@testing-library/react";
import { SWRConfig, unstable_serialize } from "swr";
import type { Cache, State } from "swr";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  HOVER_PREFETCH_DELAY_MS,
  useHoverThreadPrefetch,
} from "./use-hover-thread-prefetch";

const cache = vi.hoisted(() => ({
  read: vi.fn(),
  write: vi.fn(),
}));
const emailHtml = vi.hoisted(() => ({
  prepare: vi.fn(),
}));

vi.mock("@/utils/email-cache/threads", () => ({
  readCachedThreadDetail: cache.read,
  writeCachedThreadDetail: cache.write,
}));

vi.mock("@/utils/email/prepare-html.client", () => ({
  prepareEmailHtml: emailHtml.prepare,
}));

describe("useHoverThreadPrefetch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    cache.read.mockResolvedValue(undefined);
    cache.write.mockResolvedValue(undefined);
    emailHtml.prepare.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("prefetches a hovered conversation only after the dwell delay", async () => {
    const fetcher = vi.fn((key: [string, string]) =>
      Promise.resolve({ thread: { id: key[0], messages: [] } }),
    );
    const { result } = renderHook(
      () => useHoverThreadPrefetch({ emailAccountId: "account-dwell" }),
      { wrapper: createWrapper(fetcher) },
    );

    result.current.schedulePrefetch("thread-1");
    await vi.advanceTimersByTimeAsync(HOVER_PREFETCH_DELAY_MS - 1);
    expect(fetcher).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
    expect(fetcher.mock.calls[0]?.[0]).toEqual([
      "/api/threads/thread-1?includeDrafts=true",
      "account-dwell",
    ]);
  });

  it("does not prefetch when the pointer leaves before the delay", async () => {
    const fetcher = vi.fn();
    const { result } = renderHook(
      () => useHoverThreadPrefetch({ emailAccountId: "account-leave" }),
      { wrapper: createWrapper(fetcher) },
    );

    result.current.schedulePrefetch("thread-1");
    await vi.advanceTimersByTimeAsync(HOVER_PREFETCH_DELAY_MS - 10);
    result.current.cancelPrefetch();
    await vi.advanceTimersByTimeAsync(1000);

    expect(fetcher).not.toHaveBeenCalled();
    expect(cache.read).not.toHaveBeenCalled();
  });

  it("sweeping across rows fetches only the row the pointer settles on", async () => {
    const fetcher = vi.fn((key: [string, string]) =>
      Promise.resolve({ thread: { id: key[0], messages: [] } }),
    );
    const { result } = renderHook(
      () => useHoverThreadPrefetch({ emailAccountId: "account-sweep" }),
      { wrapper: createWrapper(fetcher) },
    );

    result.current.schedulePrefetch("thread-1");
    await vi.advanceTimersByTimeAsync(HOVER_PREFETCH_DELAY_MS - 10);
    result.current.schedulePrefetch("thread-2");
    await vi.advanceTimersByTimeAsync(HOVER_PREFETCH_DELAY_MS);

    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
    expect(fetcher.mock.calls[0]?.[0]).toEqual([
      "/api/threads/thread-2?includeDrafts=true",
      "account-sweep",
    ]);
  });

  it("skips conversations already in the SWR cache", async () => {
    const fetcher = vi.fn();
    const seeded = new Map<string, State>([
      [
        unstable_serialize([
          "/api/threads/thread-1?includeDrafts=true",
          "account-cached",
        ]),
        { data: { thread: { id: "thread-1", messages: [] } } },
      ],
    ]);
    const { result } = renderHook(
      () => useHoverThreadPrefetch({ emailAccountId: "account-cached" }),
      { wrapper: createWrapper(fetcher, () => seeded) },
    );

    result.current.schedulePrefetch("thread-1");
    await vi.advanceTimersByTimeAsync(HOVER_PREFETCH_DELAY_MS * 2);

    expect(fetcher).not.toHaveBeenCalled();
    expect(cache.read).not.toHaveBeenCalled();
  });

  it("runs one prefetch at a time and keeps only the latest intent", async () => {
    const resolvers = new Map<string, (value: unknown) => void>();
    const fetcher = vi.fn(
      (key: [string, string]) =>
        new Promise((resolve) => {
          resolvers.set(key[0], resolve);
        }),
    );
    const { result } = renderHook(
      () => useHoverThreadPrefetch({ emailAccountId: "account-flight" }),
      { wrapper: createWrapper(fetcher) },
    );

    result.current.schedulePrefetch("thread-1");
    await vi.advanceTimersByTimeAsync(HOVER_PREFETCH_DELAY_MS);
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));

    // Two more dwells while thread-1 is still in flight: only the newest runs.
    result.current.schedulePrefetch("thread-2");
    await vi.advanceTimersByTimeAsync(HOVER_PREFETCH_DELAY_MS);
    result.current.schedulePrefetch("thread-3");
    await vi.advanceTimersByTimeAsync(HOVER_PREFETCH_DELAY_MS);
    expect(fetcher).toHaveBeenCalledTimes(1);

    resolvers.get("/api/threads/thread-1?includeDrafts=true")?.({
      thread: { id: "thread-1", messages: [] },
    });
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
    expect(fetcher.mock.calls.map(([key]) => key[0])).toEqual([
      "/api/threads/thread-1?includeDrafts=true",
      "/api/threads/thread-3?includeDrafts=true",
    ]);

    // Settle the remaining request so shared in-flight state doesn't leak.
    resolvers.get("/api/threads/thread-3?includeDrafts=true")?.({
      thread: { id: "thread-3", messages: [] },
    });
    await vi.advanceTimersByTimeAsync(0);
  });
});

function createWrapper(
  fetcher: (key: [string, string]) => unknown,
  provider: () => Cache = () => new Map(),
) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <SWRConfig value={{ fetcher, provider }}>{children}</SWRConfig>;
  };
}
