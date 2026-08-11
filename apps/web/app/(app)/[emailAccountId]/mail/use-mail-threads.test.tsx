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

  it("does not show the previous view while a new view loads", async () => {
    const archiveNetwork = Promise.withResolvers<unknown>();
    cache.read.mockResolvedValue(undefined);
    const fetcher = vi.fn((key: [string, string]) =>
      key[0].includes("type=inbox")
        ? Promise.resolve({ threads: [createThread("inbox")] })
        : archiveNetwork.promise,
    );

    const { result, rerender } = renderHook(
      ({ type }: { type: "inbox" | "archive" }) =>
        useMailThreads({ emailAccountId: "account-switch", query: { type } }),
      {
        initialProps: { type: "inbox" as const },
        wrapper: createWrapper(fetcher, { keepPreviousData: true }),
      },
    );
    await waitFor(() => expect(result.current.threads[0]?.id).toBe("inbox"));

    rerender({ type: "archive" });

    expect(result.current.threads).toEqual([]);
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
  options?: { keepPreviousData?: boolean },
) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <SWRConfig value={{ fetcher, provider: () => new Map(), ...options }}>
        {children}
      </SWRConfig>
    );
  };
}
