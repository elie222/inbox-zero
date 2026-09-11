// @vitest-environment jsdom

import type { ReactNode } from "react";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { SWRConfig, unstable_serialize } from "swr";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useThread } from "./useThread";

const cache = vi.hoisted(() => ({
  read: vi.fn(),
  write: vi.fn(),
}));

vi.mock("@/providers/EmailAccountProvider", () => ({
  useAccount: () => ({ emailAccountId: "account-1" }),
}));

vi.mock("@/utils/email-cache/threads", () => ({
  readCachedThreadDetail: cache.read,
  writeCachedThreadDetail: cache.write,
}));

describe("useThread", () => {
  afterEach(cleanup);

  beforeEach(() => {
    vi.clearAllMocks();
    cache.write.mockResolvedValue(undefined);
  });

  it("returns an idle response when no thread is selected", async () => {
    const fetcher = vi.fn();

    const { result } = renderHook(() => useThread({ id: null }), {
      wrapper: createWrapper(fetcher),
    });

    expect(result.current.data).toBeUndefined();
    expect(result.current.error).toBeUndefined();
    expect(result.current.isLoading).toBe(false);
    expect(result.current.isValidating).toBe(false);
    expect(fetcher).not.toHaveBeenCalled();
    expect(cache.read).not.toHaveBeenCalled();
  });

  it("returns a persistent hit without fetching the thread again", async () => {
    const fetcher = vi.fn();
    cache.read.mockResolvedValue({
      data: { thread: { id: "thread-1", messages: [{ id: "cached" }] } },
    });

    const { result } = renderHook(() => useThread({ id: "thread-1" }), {
      wrapper: createWrapper(fetcher),
    });

    await waitFor(() => {
      expect(result.current.data?.thread.messages[0]?.id).toBe("cached");
      expect(result.current.isLoading).toBe(false);
    });
    expect(fetcher).not.toHaveBeenCalled();
    expect(cache.write).not.toHaveBeenCalled();
  });

  it("uses a matching in-memory thread without reading disk or fetching", async () => {
    const fetcher = vi.fn().mockResolvedValue({
      thread: { id: "thread-1", messages: [{ id: "refetched" }] },
    });
    const memoryData = {
      thread: { id: "thread-1", messages: [{ id: "memory" }] },
    };
    const fallbackKey = unstable_serialize([
      "/api/threads/thread-1",
      "account-1",
    ]);

    const { result } = renderHook(() => useThread({ id: "thread-1" }), {
      wrapper: createWrapper(fetcher, {
        cache: new Map([[fallbackKey, { data: memoryData }]]),
      }),
    });

    expect(result.current.data).toEqual(memoryData);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(cache.read).not.toHaveBeenCalled();
    expect(fetcher).not.toHaveBeenCalled();

    await act(async () => {
      await result.current.mutate();
    });

    expect(cache.read).not.toHaveBeenCalled();
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(result.current.data?.thread.messages[0]?.id).toBe("refetched");
  });

  it("allows an explicit refetch after serving a persistent hit", async () => {
    const fetcher = vi.fn().mockResolvedValue({
      thread: { id: "thread-1", messages: [{ id: "network" }] },
    });
    cache.read.mockResolvedValue({
      data: { thread: { id: "thread-1", messages: [{ id: "cached" }] } },
    });

    const { result } = renderHook(() => useThread({ id: "thread-1" }), {
      wrapper: createWrapper(fetcher),
    });

    await waitFor(() =>
      expect(result.current.data?.thread.messages[0]?.id).toBe("cached"),
    );
    expect(fetcher).not.toHaveBeenCalled();

    await act(async () => {
      await result.current.mutate();
    });

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(result.current.data?.thread.messages[0]?.id).toBe("network");
    expect(cache.write).toHaveBeenCalledWith(
      expect.objectContaining({
        emailAccountId: "account-1",
        threadId: "thread-1",
      }),
    );
  });

  it("keeps the open thread available while invalidation refreshes its details", async () => {
    const refreshed = Promise.withResolvers<unknown>();
    const initial = {
      thread: { id: "refresh-thread", messages: [{ id: "visible" }] },
    };
    cache.read.mockResolvedValue(undefined);
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(initial)
      .mockImplementationOnce(() => refreshed.promise);
    const { result } = renderHook(() => useThread({ id: "refresh-thread" }), {
      wrapper: createWrapper(fetcher),
    });
    await waitFor(() => expect(result.current.data).toEqual(initial));
    let refresh: Promise<unknown>;
    act(() => {
      refresh = result.current.mutate(undefined, { revalidate: true });
    });
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
    expect(result.current.isValidating).toBe(true);
    expect(result.current.data).toEqual(initial);
    expect(result.current.isLoading).toBe(false);
    await act(async () => {
      refreshed.resolve({
        thread: { id: "refresh-thread", messages: [{ id: "updated" }] },
      });
      await refresh;
    });
    expect(result.current.data?.thread.messages[0]?.id).toBe("updated");
  });

  it.each([
    "account",
    "thread",
    "variant",
  ])("does not retain details when the %s changes", async (changed) => {
    const threadId = `isolated-${changed}`;
    const initial = {
      thread: { id: threadId, messages: [{ id: "previous" }] },
    };
    const pending = Promise.withResolvers<unknown>();
    cache.read.mockResolvedValue(undefined);
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(initial)
      .mockImplementation(() => pending.promise);
    const { result, rerender } = renderHook(
      ({ emailAccountId, id, includeDrafts }) =>
        useThread({ emailAccountId, id }, { includeDrafts }),
      {
        wrapper: createWrapper(fetcher),
        initialProps: {
          emailAccountId: "account-1",
          id: threadId,
          includeDrafts: false,
        },
      },
    );
    await waitFor(() => expect(result.current.data).toEqual(initial));
    const next = {
      emailAccountId: changed === "account" ? "account-2" : "account-1",
      id: changed === "thread" ? `${threadId}-next` : threadId,
      includeDrafts: changed === "variant",
    };
    rerender(next);
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
    expect(result.current.data).toBeUndefined();
    expect(result.current.isLoading).toBe(true);
    await act(async () => {
      pending.resolve({ thread: { id: next.id, messages: [{ id: "next" }] } });
    });
    await waitFor(() =>
      expect(result.current.data?.thread.messages[0]?.id).toBe("next"),
    );
  });

  it("surfaces refresh errors after retained details finish revalidating", async () => {
    const initial = {
      thread: { id: "failed-refresh", messages: [{ id: "previous" }] },
    };
    const error = new Error("Refresh failed");
    cache.read.mockResolvedValue(undefined);
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(initial)
      .mockRejectedValue(error);
    const { result } = renderHook(() => useThread({ id: "failed-refresh" }), {
      wrapper: createWrapper(fetcher),
    });
    await waitFor(() => expect(result.current.data).toEqual(initial));
    await act(async () => {
      await result.current.mutate(undefined, { revalidate: true });
    });
    await waitFor(() => expect(result.current.error).toBe(error));
    expect(result.current.data).toBeUndefined();
  });

  it("falls back to the network when no cached detail exists", async () => {
    const network = Promise.withResolvers<unknown>();
    cache.read.mockResolvedValue(undefined);
    const fetcher = vi.fn(() => network.promise);

    const { result } = renderHook(() => useThread({ id: "thread-1" }), {
      wrapper: createWrapper(fetcher),
    });

    expect(result.current.data).toBeUndefined();
    expect(result.current.isLoading).toBe(true);

    network.resolve({
      thread: { id: "thread-1", messages: [{ id: "network-only" }] },
    });

    await waitFor(() =>
      expect(result.current.data?.thread.messages[0]?.id).toBe("network-only"),
    );
    expect(result.current.isLoading).toBe(false);
    expect(cache.write).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          thread: { id: "thread-1", messages: [{ id: "network-only" }] },
        },
        emailAccountId: "account-1",
        threadId: "thread-1",
      }),
    );
  });

  it("uses an explicit owning account for combined-mail threads", async () => {
    cache.read.mockResolvedValue(undefined);
    const fetcher = vi.fn().mockResolvedValue({
      thread: { id: "shared-thread", messages: [{ id: "secondary" }] },
    });

    const { result } = renderHook(
      () =>
        useThread({
          emailAccountId: "account-2",
          id: "shared-thread",
        }),
      { wrapper: createWrapper(fetcher) },
    );

    await waitFor(() =>
      expect(result.current.data?.thread.messages[0]?.id).toBe("secondary"),
    );
    expect(fetcher).toHaveBeenCalledWith([
      "/api/threads/shared-thread",
      "account-2",
    ]);
    expect(cache.read).toHaveBeenCalledWith({
      emailAccountId: "account-2",
      threadId: "shared-thread",
      variant: "drafts:0|replies:0",
    });
    await waitFor(() =>
      expect(cache.write).toHaveBeenCalledWith(
        expect.objectContaining({
          emailAccountId: "account-2",
          threadId: "shared-thread",
        }),
      ),
    );
  });

  it("waits for the persistent lookup before falling back to the network", async () => {
    const disk = Promise.withResolvers<unknown>();
    cache.read.mockReturnValue(disk.promise);
    const fetcher = vi.fn().mockResolvedValue({
      thread: { id: "thread-1", messages: [{ id: "network" }] },
    });

    const { result } = renderHook(() => useThread({ id: "thread-1" }), {
      wrapper: createWrapper(fetcher),
    });

    expect(result.current.isLoading).toBe(true);
    expect(fetcher).not.toHaveBeenCalled();

    await act(async () => {
      disk.resolve(undefined);
    });
    await waitFor(() =>
      expect(result.current.data?.thread.messages[0]?.id).toBe("network"),
    );
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(cache.write).toHaveBeenCalledWith(
      expect.objectContaining({
        emailAccountId: "account-1",
        threadId: "thread-1",
      }),
    );
  });

  it("does not expose or persist mismatched SWR data", async () => {
    const network = Promise.withResolvers<unknown>();
    cache.read.mockResolvedValue(undefined);
    const fetcher = vi.fn(() => network.promise);
    const staleData = {
      thread: { id: "thread-1", messages: [{ id: "stale" }] },
    };
    const fallbackKey = unstable_serialize([
      "/api/threads/thread-2",
      "account-1",
    ]);

    const { result } = renderHook(() => useThread({ id: "thread-2" }), {
      wrapper: createWrapper(fetcher, {
        fallback: { [fallbackKey]: staleData },
      }),
    });

    expect(result.current.data).toBeUndefined();
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
    expect(cache.write).not.toHaveBeenCalledWith(
      expect.objectContaining({
        threadId: "thread-2",
        data: staleData,
      }),
    );
  });
});

function createWrapper(
  fetcher: (key: [string, string]) => unknown,
  options?: {
    cache?: Map<string, unknown>;
    keepPreviousData?: boolean;
    fallback?: Record<string, unknown>;
  },
) {
  const { cache: initialCache, ...config } = options ?? {};
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <SWRConfig
        value={{
          fetcher,
          provider: () => initialCache ?? new Map(),
          ...config,
        }}
      >
        {children}
      </SWRConfig>
    );
  };
}
