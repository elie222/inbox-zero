// @vitest-environment jsdom

import type { ReactNode } from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { SWRConfig } from "swr";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useMailThreads } from "./use-mail-threads";

const cache = vi.hoisted(() => ({
  read: vi.fn(),
  remove: vi.fn(),
  restore: vi.fn(),
  write: vi.fn(),
}));

vi.mock("@/utils/email-cache/thread-lists", () => ({
  readCachedThreadList: cache.read,
  removeCachedThreadsFromView: cache.remove,
  restoreCachedThreadsToView: cache.restore,
  writeCachedThreadList: cache.write,
}));

describe("useMailThreads", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cache.remove.mockResolvedValue(undefined);
    cache.restore.mockResolvedValue(undefined);
    cache.write.mockResolvedValue(undefined);
  });

  it("renders the cached first page while the server revalidates", async () => {
    const network = Promise.withResolvers<unknown>();
    cache.read.mockResolvedValue({
      cachedAt: 100,
      hasMore: true,
      threads: [createThread("cached")],
    });

    const { result } = renderHook(
      () =>
        useMailThreads({
          emailAccountId: "account-warm",
          query: { type: "inbox" },
        }),
      { wrapper: createWrapper(() => network.promise) },
    );

    await waitFor(() => {
      expect(result.current.threads[0]?.id).toBe("cached");
      expect(result.current.isLoading).toBe(false);
      expect(result.current.hasMore).toBe(true);
    });
  });

  it("keeps network rows when the disk read finishes later", async () => {
    const disk = Promise.withResolvers<unknown>();
    const network = Promise.withResolvers<unknown>();
    cache.read.mockReturnValue(disk.promise);

    const { result } = renderHook(
      () =>
        useMailThreads({
          emailAccountId: "account-race",
          query: { type: "inbox" },
        }),
      { wrapper: createWrapper(() => network.promise) },
    );

    await act(async () => {
      network.resolve({ threads: [createThread("network")] });
    });
    await waitFor(() => expect(result.current.threads[0]?.id).toBe("network"));

    await act(async () => {
      disk.resolve({
        cachedAt: 100,
        hasMore: false,
        threads: [createThread("cached")],
      });
    });

    expect(result.current.threads[0]?.id).toBe("network");
  });

  it("persists optimistic archive and undo from a warm page", async () => {
    const network = Promise.withResolvers<unknown>();
    cache.read.mockResolvedValue({
      cachedAt: 100,
      hasMore: false,
      threads: [createThread("one"), createThread("two")],
    });
    const { result } = renderHook(
      () =>
        useMailThreads({
          emailAccountId: "account-mutation",
          query: { type: "inbox" },
        }),
      { wrapper: createWrapper(() => network.promise) },
    );
    await waitFor(() => expect(result.current.threads).toHaveLength(2));

    act(() => result.current.removeThreads(["one"]));
    expect(result.current.threads.map((thread) => thread.id)).toEqual(["two"]);
    expect(cache.remove).toHaveBeenCalledWith(
      expect.objectContaining({
        emailAccountId: "account-mutation",
        threadIds: ["one"],
      }),
    );

    act(() => result.current.restoreThreads(["one"]));
    expect(result.current.threads.map((thread) => thread.id)).toEqual([
      "one",
      "two",
    ]);
    expect(cache.restore).toHaveBeenCalledWith(
      expect.objectContaining({ emailAccountId: "account-mutation" }),
    );
  });

  it("loads the next page with one click from a persistent view", async () => {
    const firstPage = Promise.withResolvers<unknown>();
    const secondPage = Promise.withResolvers<unknown>();
    cache.read.mockResolvedValue({
      cachedAt: 100,
      hasMore: true,
      threads: [createThread("cached")],
    });
    const fetcher = vi
      .fn()
      .mockReturnValueOnce(firstPage.promise)
      .mockReturnValueOnce(secondPage.promise);

    const { result } = renderHook(
      () =>
        useMailThreads({
          emailAccountId: "account-pagination",
          query: { type: "inbox" },
        }),
      { wrapper: createWrapper(fetcher) },
    );
    await waitFor(() => expect(result.current.threads[0]?.id).toBe("cached"));

    act(() => result.current.loadMore());
    expect(result.current.isLoadingMore).toBe(true);

    await act(async () => {
      firstPage.resolve({
        threads: [createThread("network")],
        nextPageToken: "page-2",
      });
    });
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
    expect(fetcher.mock.calls[1]?.[0][0]).toContain("nextPageToken=page-2");

    await act(async () => {
      secondPage.resolve({ threads: [createThread("second-page")] });
    });
    await waitFor(() =>
      expect(result.current.threads.map((thread) => thread.id)).toEqual([
        "network",
        "second-page",
      ]),
    );
  });

  it("retries a failed first page before loading more from cache", async () => {
    cache.read.mockResolvedValue({
      cachedAt: 100,
      hasMore: true,
      threads: [createThread("cached")],
    });
    const fetcher = vi
      .fn()
      .mockRejectedValueOnce(new Error("temporary failure"))
      .mockResolvedValueOnce({
        threads: [createThread("network")],
        nextPageToken: "page-2",
      })
      .mockResolvedValueOnce({ threads: [createThread("second-page")] });

    const { result } = renderHook(
      () =>
        useMailThreads({
          emailAccountId: "account-retry",
          query: { type: "inbox" },
        }),
      { wrapper: createWrapper(fetcher) },
    );
    await waitFor(() => expect(result.current.threads[0]?.id).toBe("cached"));
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
    await act(async () => {
      await Promise.resolve();
    });

    act(() => result.current.loadMore());

    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(3));
    expect(fetcher.mock.calls[2]?.[0][0]).toContain("nextPageToken=page-2");
    await waitFor(() =>
      expect(result.current.threads.map((thread) => thread.id)).toEqual([
        "network",
        "second-page",
      ]),
    );
  });

  it("retries when the pending first page fails after load more", async () => {
    const firstPage = Promise.withResolvers<unknown>();
    cache.read.mockResolvedValue({
      cachedAt: 100,
      hasMore: true,
      threads: [createThread("cached")],
    });
    const fetcher = vi
      .fn()
      .mockReturnValueOnce(firstPage.promise)
      .mockResolvedValueOnce({
        threads: [createThread("network")],
        nextPageToken: "page-2",
      })
      .mockResolvedValueOnce({ threads: [createThread("second-page")] });

    const { result } = renderHook(
      () =>
        useMailThreads({
          emailAccountId: "account-pending-retry",
          query: { type: "inbox" },
        }),
      { wrapper: createWrapper(fetcher) },
    );
    await waitFor(() => expect(result.current.threads[0]?.id).toBe("cached"));

    act(() => result.current.loadMore());
    expect(result.current.isLoadingMore).toBe(true);
    await act(async () => {
      firstPage.reject(new Error("temporary failure"));
    });

    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(3));
    expect(fetcher.mock.calls[2]?.[0][0]).toContain("nextPageToken=page-2");
    await waitFor(() =>
      expect(result.current.threads.map((thread) => thread.id)).toEqual([
        "network",
        "second-page",
      ]),
    );
  });

  it("rehydrates a revisited view after its remote pages were evicted", async () => {
    const archiveNetwork = Promise.withResolvers<unknown>();
    let inboxReads = 0;
    cache.read.mockImplementation(async ({ viewKey }: { viewKey: string }) => {
      if (!viewKey.includes('"type":"inbox"')) return;
      inboxReads += 1;
      return inboxReads === 1
        ? undefined
        : {
            cachedAt: 100,
            hasMore: false,
            threads: [createThread("cached-inbox")],
          };
    });
    const fetcher = vi.fn((key: [string, string]) =>
      key[0].includes("type=inbox")
        ? Promise.resolve({ threads: [createThread("inbox")] })
        : archiveNetwork.promise,
    );
    const provider = new Map();

    const { result, rerender } = renderHook(
      ({ type }: { type: "inbox" | "archive" }) =>
        useMailThreads({ emailAccountId: "account-switch", query: { type } }),
      {
        initialProps: { type: "inbox" as const },
        wrapper: createWrapper(fetcher, provider),
      },
    );
    await waitFor(() => expect(result.current.threads[0]?.id).toBe("inbox"));

    rerender({ type: "archive" });
    await waitFor(() => expect(cache.read).toHaveBeenCalledTimes(2));
    provider.clear();
    rerender({ type: "inbox" });

    await waitFor(() =>
      expect(result.current.threads[0]?.id).toBe("cached-inbox"),
    );
  });
});

function createThread(id: string) {
  return {
    id,
    messages: [],
    plan: undefined,
    plans: [],
    snippet: id,
  };
}

function createWrapper(
  fetcher: (key: [string, string]) => unknown,
  provider = new Map(),
) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <SWRConfig
        value={{ fetcher, provider: () => provider, shouldRetryOnError: false }}
      >
        {children}
      </SWRConfig>
    );
  };
}
