// @vitest-environment jsdom

import type { ReactNode } from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { SWRConfig } from "swr";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  type OptimisticThreadUpdate,
  useMailThreads,
} from "./use-mail-threads";

const cache = vi.hoisted(() => ({
  read: vi.fn(),
  remove: vi.fn(),
  restore: vi.fn(),
  write: vi.fn(),
  writeRows: vi.fn(),
}));
const mailbox = vi.hoisted(() => ({
  listeners: new Set<(emailAccountId: string) => void>(),
  read: vi.fn(),
  subscribe: vi.fn(),
}));

vi.mock("@/utils/email-cache/thread-lists", () => ({
  readCachedThreadList: cache.read,
  removeCachedThreadsFromView: cache.remove,
  restoreCachedThreadsToView: cache.restore,
  writeCachedThreadList: cache.write,
  writeCachedThreadRows: cache.writeRows,
}));
vi.mock("@/utils/email-cache/mailbox", () => ({
  readSyncedMailboxThreads: mailbox.read,
  subscribeToMailboxStore: mailbox.subscribe,
}));

describe("useMailThreads", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cache.remove.mockResolvedValue(undefined);
    cache.restore.mockResolvedValue(undefined);
    cache.write.mockResolvedValue(undefined);
    cache.writeRows.mockResolvedValue(undefined);
    mailbox.listeners.clear();
    mailbox.read.mockResolvedValue(undefined);
    mailbox.subscribe.mockImplementation(
      (listener: (emailAccountId: string) => void) => {
        mailbox.listeners.add(listener);
        return () => mailbox.listeners.delete(listener);
      },
    );
  });

  it("supports optimistic actions before the server mailbox page arrives", async () => {
    const network = Promise.withResolvers<unknown>();
    cache.read.mockResolvedValue(undefined);
    mailbox.read.mockResolvedValue({
      after: "2026-07-24T00:00:00.000Z",
      complete: true,
      syncedAt: 100,
      threads: [createThread("local", ["INBOX", "UNREAD"])],
    });
    const { result } = renderHook(
      () =>
        useMailThreads({
          emailAccountId: "account-local",
          query: { type: "inbox" },
        }),
      { wrapper: createWrapper(() => network.promise) },
    );
    await waitFor(() => expect(result.current.threads).toHaveLength(1));

    let removal!: ReturnType<typeof result.current.removeThreads>;
    act(() => {
      removal = result.current.removeThreads(["local"]);
    });
    expect(result.current.threads).toEqual([]);

    act(() => result.current.restoreThreads(removal, ["local"]));
    expect(result.current.threads.map((thread) => thread.id)).toEqual([
      "local",
    ]);

    act(() => {
      result.current.optimisticallyUpdateThreads(["local"], (thread) => ({
        ...thread,
        snippet: "updated locally",
      }));
    });
    expect(result.current.threads[0]?.snippet).toBe("updated locally");
    expect(mailbox.read).toHaveBeenCalledOnce();
  });

  it("uses newer synced messages without losing server rule metadata", async () => {
    const plan = { id: "execution-1", rule: { id: "rule-1" } };
    const remoteThread = {
      ...createThread("shared"),
      plan,
      plans: [plan],
      snippet: "remote",
    };
    remoteThread.messages[0]!.internalDate = "2026-08-22T00:00:00.000Z";
    const syncedThread = {
      ...createThread("shared"),
      snippet: "synced",
    };
    syncedThread.messages[0]!.internalDate = "2026-08-23T00:00:00.000Z";
    const remoteOlderThread = createThread("remote-older");
    remoteOlderThread.messages[0]!.internalDate = "2026-08-10T00:00:00.000Z";
    mailbox.read
      .mockResolvedValueOnce({
        after: "2026-07-24T00:00:00.000Z",
        complete: true,
        syncedAt: 1,
        truncated: false,
        threads: [syncedThread],
      })
      .mockResolvedValue({
        after: "2026-07-24T00:00:00.000Z",
        complete: true,
        syncedAt: Number.MAX_SAFE_INTEGER,
        truncated: true,
        threads: [syncedThread],
      });
    const query = { type: "inbox" };
    const { result } = renderHook(
      () => useMailThreads({ emailAccountId: "account-merge", query }),
      {
        wrapper: createWrapper(() =>
          Promise.resolve({ threads: [remoteThread, remoteOlderThread] }),
        ),
      },
    );
    await waitFor(() =>
      expect(result.current.threads[0]?.snippet).toBe("remote"),
    );

    act(() => {
      for (const listener of mailbox.listeners) listener("account-merge");
    });

    await waitFor(() =>
      expect(result.current.threads[0]?.snippet).toBe("synced"),
    );
    expect(result.current.threads.map((thread) => thread.id)).toEqual([
      "shared",
      "remote-older",
    ]);
    expect(result.current.threads[0]).toMatchObject({ plan, plans: [plan] });
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

    let removal!: ReturnType<typeof result.current.removeThreads>;
    act(() => {
      removal = result.current.removeThreads(["one"]);
    });
    expect(result.current.threads.map((thread) => thread.id)).toEqual(["two"]);
    expect(cache.remove).toHaveBeenCalledWith(
      expect.objectContaining({
        emailAccountId: "account-mutation",
        threadIds: ["one"],
      }),
    );

    act(() => result.current.restoreThreads(removal, ["one"]));
    expect(result.current.threads.map((thread) => thread.id)).toEqual([
      "one",
      "two",
    ]);
    expect(cache.restore).toHaveBeenCalledWith(
      expect.objectContaining({ emailAccountId: "account-mutation" }),
    );
  });

  it("updates cached rows immediately and can roll them back", async () => {
    const network = Promise.withResolvers<unknown>();
    cache.read.mockResolvedValue({
      cachedAt: 100,
      hasMore: false,
      threads: [createThread("one", ["INBOX", "UNREAD"])],
    });
    const { result } = renderHook(
      () =>
        useMailThreads({
          emailAccountId: "account-update",
          query: { type: "inbox" },
        }),
      { wrapper: createWrapper(() => network.promise) },
    );
    await waitFor(() => expect(result.current.threads).toHaveLength(1));

    let update!: OptimisticThreadUpdate;
    act(() => {
      update = result.current.optimisticallyUpdateThreads(
        ["one"],
        (thread) => ({
          ...thread,
          messages: thread.messages.map((message) => ({
            ...message,
            labelIds: message.labelIds?.filter((label) => label !== "UNREAD"),
          })),
        }),
      );
    });

    expect(result.current.threads[0]?.messages[0]?.labelIds).toEqual(["INBOX"]);
    expect(update.threadIds).toEqual(["one"]);
    expect(cache.writeRows).toHaveBeenLastCalledWith({
      emailAccountId: "account-update",
      threads: [expect.objectContaining({ id: "one" })],
    });

    act(() => update.rollback(["one"]));

    expect(result.current.threads[0]?.messages[0]?.labelIds).toEqual([
      "INBOX",
      "UNREAD",
    ]);
    expect(cache.writeRows).toHaveBeenLastCalledWith({
      emailAccountId: "account-update",
      threads: [expect.objectContaining({ id: "one" })],
    });
  });

  it("does not let an older rollback overwrite a newer optimistic update", async () => {
    const network = Promise.withResolvers<unknown>();
    cache.read.mockResolvedValue({
      cachedAt: 100,
      hasMore: false,
      threads: [createThread("one", ["INBOX", "UNREAD"])],
    });
    const { result } = renderHook(
      () =>
        useMailThreads({
          emailAccountId: "account-concurrent",
          query: { type: "inbox" },
        }),
      { wrapper: createWrapper(() => network.promise) },
    );
    await waitFor(() => expect(result.current.threads).toHaveLength(1));

    let first!: OptimisticThreadUpdate;
    act(() => {
      first = result.current.optimisticallyUpdateThreads(["one"], (thread) => ({
        ...thread,
        snippet: "first update",
      }));
    });
    act(() => {
      result.current.optimisticallyUpdateThreads(["one"], (thread) => ({
        ...thread,
        snippet: "second update",
      }));
    });
    expect(cache.writeRows).toHaveBeenCalledTimes(2);
    act(() => first.rollback(["one"]));

    expect(result.current.threads[0]?.snippet).toBe("second update");
    expect(cache.writeRows).toHaveBeenCalledTimes(2);
    expect(cache.writeRows).toHaveBeenLastCalledWith({
      emailAccountId: "account-concurrent",
      threads: [expect.objectContaining({ snippet: "second update" })],
    });
  });

  it("revalidates after rolling back an optimistic update", async () => {
    cache.read.mockResolvedValue(undefined);
    const rollbackWrite = Promise.withResolvers<void>();
    cache.writeRows
      .mockResolvedValueOnce(undefined)
      .mockReturnValueOnce(rollbackWrite.promise);
    const fetcher = vi.fn().mockResolvedValue({
      threads: [createThread("one", ["INBOX", "UNREAD"])],
    });
    const { result } = renderHook(
      () =>
        useMailThreads({
          emailAccountId: "account-revalidation",
          query: { type: "inbox" },
        }),
      { wrapper: createWrapper(fetcher) },
    );
    await waitFor(() => expect(result.current.threads).toHaveLength(1));
    expect(fetcher).toHaveBeenCalledOnce();

    let update!: OptimisticThreadUpdate;
    act(() => {
      update = result.current.optimisticallyUpdateThreads(
        ["one"],
        (thread) => ({ ...thread, snippet: "optimistic" }),
      );
      update.rollback(["one"]);
    });

    await act(async () => Promise.resolve());
    expect(fetcher).toHaveBeenCalledOnce();

    rollbackWrite.resolve();
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
  });

  it("waits for concurrent optimistic updates before revalidating", async () => {
    cache.read.mockResolvedValue(undefined);
    const fetcher = vi.fn().mockResolvedValue({
      threads: [
        createThread("one", ["INBOX", "UNREAD"]),
        createThread("two", ["INBOX", "UNREAD"]),
      ],
    });
    const { result } = renderHook(
      () =>
        useMailThreads({
          emailAccountId: "account-concurrent-revalidation",
          query: { type: "inbox" },
        }),
      { wrapper: createWrapper(fetcher) },
    );
    await waitFor(() => expect(result.current.threads).toHaveLength(2));

    let first!: OptimisticThreadUpdate;
    let second!: OptimisticThreadUpdate;
    act(() => {
      first = result.current.optimisticallyUpdateThreads(["one"], (thread) => ({
        ...thread,
        snippet: "first update",
      }));
      second = result.current.optimisticallyUpdateThreads(
        ["two"],
        (thread) => ({ ...thread, snippet: "second update" }),
      );
      first.rollback(["one"]);
    });

    await act(async () => Promise.resolve());
    expect(fetcher).toHaveBeenCalledOnce();
    expect(result.current.threads[1]?.snippet).toBe("second update");

    act(() => second.commit("two"));
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
  });

  it("restores a failed batch with one cache write and revalidation", async () => {
    cache.read.mockResolvedValue(undefined);
    const fetcher = vi.fn().mockResolvedValue({
      threads: [createThread("one"), createThread("two")],
    });
    const { result } = renderHook(
      () =>
        useMailThreads({
          emailAccountId: "account-batch-rollback",
          query: { type: "inbox" },
        }),
      { wrapper: createWrapper(fetcher) },
    );
    await waitFor(() => expect(result.current.threads).toHaveLength(2));

    let update!: OptimisticThreadUpdate;
    act(() => {
      update = result.current.optimisticallyUpdateThreads(
        ["one", "two"],
        (thread) => ({ ...thread, snippet: "optimistic" }),
      );
    });
    expect(cache.writeRows).toHaveBeenCalledTimes(1);

    act(() => update.rollback(["one", "two"]));

    expect(cache.writeRows).toHaveBeenCalledTimes(2);
    expect(cache.writeRows).toHaveBeenLastCalledWith({
      emailAccountId: "account-batch-rollback",
      threads: [
        expect.objectContaining({ id: "one", snippet: "one" }),
        expect.objectContaining({ id: "two", snippet: "two" }),
      ],
    });
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
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

  it("does not request two pages when load more is called twice before the next page arrives", async () => {
    const secondPage = Promise.withResolvers<unknown>();
    cache.read.mockResolvedValue(undefined);
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce({
        threads: [createThread("one")],
        nextPageToken: "page-2",
      })
      .mockReturnValueOnce(secondPage.promise)
      .mockResolvedValueOnce({ threads: [createThread("three")] });

    const { result } = renderHook(
      () =>
        useMailThreads({
          emailAccountId: "account-double-load",
          query: { type: "inbox" },
        }),
      { wrapper: createWrapper(fetcher) },
    );
    await waitFor(() => expect(result.current.threads[0]?.id).toBe("one"));

    act(() => {
      result.current.loadMore();
      result.current.loadMore();
    });

    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
    expect(fetcher.mock.calls[1]?.[0][0]).toContain("nextPageToken=page-2");

    await act(async () => {
      secondPage.resolve({
        threads: [createThread("two")],
        nextPageToken: "page-3",
      });
    });
    await waitFor(() =>
      expect(result.current.threads.map((thread) => thread.id)).toEqual([
        "one",
        "two",
      ]),
    );
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("loads a later page after the previous extra page has arrived", async () => {
    const secondPage = Promise.withResolvers<unknown>();
    const thirdPage = Promise.withResolvers<unknown>();
    cache.read.mockResolvedValue(undefined);
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce({
        threads: [createThread("one")],
        nextPageToken: "page-2",
      })
      .mockReturnValueOnce(secondPage.promise)
      .mockReturnValueOnce(thirdPage.promise);

    const { result } = renderHook(
      () =>
        useMailThreads({
          emailAccountId: "account-sequential-load",
          query: { type: "inbox" },
        }),
      { wrapper: createWrapper(fetcher) },
    );
    await waitFor(() => expect(result.current.threads[0]?.id).toBe("one"));

    act(() => result.current.loadMore());
    await act(async () => {
      secondPage.resolve({
        threads: [createThread("two")],
        nextPageToken: "page-3",
      });
    });
    await waitFor(() =>
      expect(result.current.threads.map((thread) => thread.id)).toEqual([
        "one",
        "two",
      ]),
    );

    act(() => result.current.loadMore());
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(3));
    expect(fetcher.mock.calls[2]?.[0][0]).toContain("nextPageToken=page-3");

    await act(async () => {
      thirdPage.resolve({ threads: [createThread("three")] });
    });
    await waitFor(() =>
      expect(result.current.threads.map((thread) => thread.id)).toEqual([
        "one",
        "two",
        "three",
      ]),
    );
  });

  it("retries the next page after a failed load more", async () => {
    cache.read.mockResolvedValue(undefined);
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce({
        threads: [createThread("one")],
        nextPageToken: "page-2",
      })
      .mockRejectedValueOnce(new Error("page two failed"))
      .mockResolvedValueOnce({
        threads: [createThread("two")],
      });

    const { result } = renderHook(
      () =>
        useMailThreads({
          emailAccountId: "account-load-more-retry",
          query: { type: "inbox" },
        }),
      { wrapper: createWrapper(fetcher) },
    );
    await waitFor(() => expect(result.current.threads[0]?.id).toBe("one"));

    act(() => result.current.loadMore());
    await waitFor(() => expect(result.current.isLoadingMore).toBe(false));

    act(() => result.current.loadMore());
    await waitFor(() =>
      expect(result.current.threads.map((thread) => thread.id)).toEqual([
        "one",
        "two",
      ]),
    );
    expect(fetcher.mock.calls[2]?.[0][0]).toContain("nextPageToken=page-2");
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

function createThread(id: string, labelIds: string[] = []) {
  return {
    id,
    messages: [
      {
        id: `${id}-message`,
        threadId: id,
        snippet: id,
        subject: id,
        date: "0",
        internalDate: "0",
        labelIds,
        headers: { subject: id },
      },
    ],
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
