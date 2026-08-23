// @vitest-environment jsdom

import type { ReactNode } from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { SWRConfig } from "swr";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useCombinedMailThreads } from "./use-combined-mail-threads";

const cache = vi.hoisted(() => ({
  read: vi.fn(),
  remove: vi.fn(),
  restore: vi.fn(),
  write: vi.fn(),
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
}));
vi.mock("@/utils/email-cache/mailbox", () => ({
  readCombinedSyncedMailboxThreads: mailbox.read,
  subscribeToMailboxStore: mailbox.subscribe,
}));

describe("useCombinedMailThreads", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cache.read.mockResolvedValue(undefined);
    cache.remove.mockResolvedValue(undefined);
    cache.restore.mockResolvedValue(undefined);
    cache.write.mockResolvedValue(undefined);
    mailbox.listeners.clear();
    mailbox.read.mockResolvedValue(undefined);
    mailbox.subscribe.mockImplementation(
      (listener: (emailAccountId: string) => void) => {
        mailbox.listeners.add(listener);
        return () => mailbox.listeners.delete(listener);
      },
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders a complete merged mailbox while the server revalidates", async () => {
    const network = Promise.withResolvers<unknown>();
    mailbox.read.mockResolvedValue({
      accountStates: ACCOUNT_STATES,
      complete: true,
      missingAccountIds: [],
      threads: [createThread("account-2", "local")],
      truncated: false,
    });

    const { result } = renderHook(
      () =>
        useCombinedMailThreads({
          accounts: ACCOUNTS,
          emailAccountId: "account-1",
          enabled: true,
          isUnread: false,
        }),
      { wrapper: createWrapper(() => network.promise) },
    );

    await waitFor(() => {
      expect(result.current.threads.map((thread) => thread.id)).toEqual([
        "local",
      ]);
      expect(result.current.hasMore).toBe(false);
      expect(result.current.isLoading).toBe(false);
    });
    expect(mailbox.read).toHaveBeenCalledWith({
      accounts: ACCOUNTS,
      limit: 20,
      query: { type: "inbox" },
    });
  });

  it("uses a newer server page when the persisted mailbox predates the request", async () => {
    mailbox.read.mockResolvedValue({
      accountStates: ACCOUNT_STATES,
      complete: true,
      missingAccountIds: [],
      threads: [createThread("account-1", "canonical")],
      truncated: false,
    });

    const { result } = renderHook(
      () =>
        useCombinedMailThreads({
          accounts: ACCOUNTS,
          emailAccountId: "account-1",
          enabled: true,
          isUnread: false,
        }),
      {
        wrapper: createWrapper(() =>
          Promise.resolve({
            failedAccountIds: [],
            labelsByAccount: {},
            nextPageToken: null,
            threads: [
              {
                ...createThread("account-1", "canonical"),
                snippet: "remote",
              },
              createThread("account-2", "stale-recent"),
              createThread(
                "account-2",
                "older-than-local-window",
                "2026-07-01T10:00:00.000Z",
              ),
            ],
          }),
        ),
      },
    );

    await waitFor(() => {
      expect(cache.write).toHaveBeenCalledOnce();
      expect(result.current.threads.map((thread) => thread.id)).toEqual([
        "canonical",
        "stale-recent",
        "older-than-local-window",
      ]);
      expect(result.current.threads[0]?.snippet).toBe("remote");
    });
  });

  it("keeps cached rows outside the first server page", async () => {
    mailbox.read.mockResolvedValue({
      accountStates: ACCOUNT_STATES,
      complete: true,
      missingAccountIds: [],
      threads: [
        createThread("account-1", "remote-row"),
        createThread("account-2", "stale-recent", "2026-08-23T10:01:00.000Z"),
        createThread("account-2", "cached-only", "2026-08-23T09:59:00.000Z"),
      ],
      truncated: false,
    });

    const { result } = renderHook(
      () =>
        useCombinedMailThreads({
          accounts: ACCOUNTS,
          emailAccountId: "account-1",
          enabled: true,
          isUnread: false,
        }),
      {
        wrapper: createWrapper(() =>
          Promise.resolve({
            failedAccountIds: [],
            labelsByAccount: {},
            nextPageToken: "next-page",
            threads: [
              {
                ...createThread("account-1", "remote-row"),
                snippet: "remote",
              },
            ],
          }),
        ),
      },
    );

    await waitFor(() => {
      expect(result.current.threads.map((thread) => thread.id)).toEqual([
        "remote-row",
        "cached-only",
      ]);
      expect(result.current.threads[0]?.snippet).toBe("remote");
      expect(cache.write).toHaveBeenLastCalledWith(
        expect.objectContaining({
          hasMore: true,
          threads: expect.arrayContaining([
            expect.objectContaining({ id: "account-1:remote-row" }),
            expect.objectContaining({ id: "account-2:cached-only" }),
          ]),
        }),
      );
    });
  });

  it("keeps a mailbox sync that completes while the server request is in flight", async () => {
    vi.spyOn(Date, "now").mockReturnValue(100);
    const network = Promise.withResolvers<unknown>();
    mailbox.read.mockResolvedValue({
      accountStates: createAccountStates(200),
      complete: true,
      missingAccountIds: [],
      threads: [createThread("account-1", "local-only")],
      truncated: false,
    });
    const { result } = renderHook(
      () =>
        useCombinedMailThreads({
          accounts: ACCOUNTS,
          emailAccountId: "account-1",
          enabled: true,
          isUnread: false,
        }),
      { wrapper: createWrapper(() => network.promise) },
    );
    await waitFor(() =>
      expect(result.current.threads.map((thread) => thread.id)).toEqual([
        "local-only",
      ]),
    );

    vi.mocked(Date.now).mockReturnValue(300);
    await act(async () => {
      network.resolve({
        failedAccountIds: [],
        labelsByAccount: {},
        nextPageToken: null,
        threads: [createThread("account-1", "server-only")],
      });
      await network.promise;
    });

    await waitFor(() => expect(cache.write).toHaveBeenCalled());
    expect(result.current.threads.map((thread) => thread.id)).toEqual([
      "local-only",
    ]);
  });

  it("keeps a complete canonical snapshot after it syncs more recently than the server page", async () => {
    mailbox.read.mockResolvedValue({
      accountStates: createAccountStates(Number.MAX_SAFE_INTEGER),
      complete: true,
      missingAccountIds: [],
      threads: [createThread("account-1", "canonical")],
      truncated: false,
    });

    const { result } = renderHook(
      () =>
        useCombinedMailThreads({
          accounts: ACCOUNTS,
          emailAccountId: "account-1",
          enabled: true,
          isUnread: false,
        }),
      {
        wrapper: createWrapper(() =>
          Promise.resolve({
            failedAccountIds: [],
            labelsByAccount: {},
            nextPageToken: null,
            threads: [
              {
                ...createThread("account-1", "canonical"),
                snippet: "remote",
              },
              createThread("account-2", "stale-recent"),
              createThread(
                "account-2",
                "older-than-local-window",
                "2026-07-01T10:00:00.000Z",
              ),
            ],
          }),
        ),
      },
    );

    await waitFor(() => {
      expect(cache.write).toHaveBeenCalledOnce();
      expect(result.current.threads.map((thread) => thread.id)).toEqual([
        "canonical",
        "older-than-local-window",
      ]);
      expect(result.current.threads[0]?.snippet).toBe("canonical");
    });
  });

  it("keeps valid next-page rows when an account mailbox is truncated", async () => {
    mailbox.read.mockResolvedValue({
      accountStates: {
        ...createAccountStates(Number.MAX_SAFE_INTEGER),
        "account-2": {
          ...ACCOUNT_STATES["account-2"],
          syncedAt: Number.MAX_SAFE_INTEGER,
          truncated: true,
        },
      },
      complete: true,
      missingAccountIds: [],
      threads: [
        createThread("account-1", "canonical"),
        createThread("account-2", "boundary"),
      ],
      truncated: true,
    });

    const { result } = renderHook(
      () =>
        useCombinedMailThreads({
          accounts: ACCOUNTS,
          emailAccountId: "account-1",
          enabled: true,
          isUnread: false,
        }),
      {
        wrapper: createWrapper(() =>
          Promise.resolve({
            failedAccountIds: [],
            labelsByAccount: {},
            nextPageToken: "next-page",
            threads: [
              createThread(
                "account-2",
                "stale-recent",
                "2026-08-23T10:01:00.000Z",
              ),
              createThread("account-1", "canonical"),
              createThread(
                "account-2",
                "valid-next-page-row",
                "2026-08-23T09:59:00.000Z",
              ),
            ],
          }),
        ),
      },
    );

    await waitFor(() => {
      expect(cache.write).toHaveBeenCalledOnce();
      expect(result.current.threads.map((thread) => thread.id)).toEqual([
        "canonical",
        "boundary",
        "valid-next-page-row",
      ]);
    });
  });

  it("does not hide authoritative local rows when the server is exhausted", async () => {
    mailbox.read.mockResolvedValue({
      accountStates: createAccountStates(Number.MAX_SAFE_INTEGER),
      complete: true,
      missingAccountIds: [],
      threads: Array.from({ length: 21 }, (_, index) =>
        createThread(
          index % 2 ? "account-1" : "account-2",
          `local-${index}`,
          new Date(Date.UTC(2026, 7, 23, 10, 0, index)).toISOString(),
        ),
      ),
      truncated: false,
    });

    const { result } = renderHook(
      () =>
        useCombinedMailThreads({
          accounts: ACCOUNTS,
          emailAccountId: "account-1",
          enabled: true,
          isUnread: false,
        }),
      {
        wrapper: createWrapper(() =>
          Promise.resolve({
            failedAccountIds: [],
            labelsByAccount: {},
            nextPageToken: null,
            threads: [],
          }),
        ),
      },
    );

    await waitFor(() => {
      expect(cache.write).toHaveBeenCalledOnce();
      expect(result.current.threads).toHaveLength(21);
      expect(result.current.hasMore).toBe(false);
    });
  });

  it("loads more synchronized rows while the server is unavailable", async () => {
    const localThreads = Array.from({ length: 25 }, (_, index) =>
      createThread(
        index % 2 ? "account-1" : "account-2",
        `local-${index}`,
        new Date(Date.UTC(2026, 7, 23, 10, 0, index)).toISOString(),
      ),
    );
    mailbox.read.mockImplementation(({ limit }: { limit: number }) =>
      Promise.resolve({
        accountStates: createAccountStates(Number.MAX_SAFE_INTEGER),
        complete: true,
        missingAccountIds: [],
        threads: localThreads.slice(0, limit),
        truncated: localThreads.length > limit,
      }),
    );
    const network = Promise.withResolvers<unknown>();
    const { result } = renderHook(
      () =>
        useCombinedMailThreads({
          accounts: ACCOUNTS,
          emailAccountId: "account-1",
          enabled: true,
          isUnread: false,
        }),
      { wrapper: createWrapper(() => network.promise) },
    );

    await waitFor(() => {
      expect(result.current.threads).toHaveLength(20);
      expect(result.current.hasMore).toBe(true);
    });

    act(() => result.current.loadMore());

    await waitFor(() => {
      expect(result.current.threads).toHaveLength(25);
      expect(result.current.hasMore).toBe(false);
    });
    expect(mailbox.read).toHaveBeenLastCalledWith({
      accounts: ACCOUNTS,
      limit: 40,
      query: { type: "inbox" },
    });
  });

  it("loads more synchronized rows before requesting another server page", async () => {
    const localThreads = Array.from({ length: 25 }, (_, index) =>
      createThread(
        index % 2 ? "account-1" : "account-2",
        `local-${index}`,
        new Date(Date.UTC(2026, 7, 23, 10, 0, 25 - index)).toISOString(),
      ),
    );
    mailbox.read.mockImplementation(({ limit }: { limit: number }) =>
      Promise.resolve({
        accountStates: createAccountStates(Number.MAX_SAFE_INTEGER),
        complete: true,
        missingAccountIds: [],
        threads: localThreads.slice(0, limit),
        truncated: localThreads.length > limit,
      }),
    );
    const fetcher = vi.fn((key: string) =>
      Promise.resolve(
        key.includes("cursor=next-page")
          ? {
              failedAccountIds: [],
              labelsByAccount: {},
              nextPageToken: null,
              threads: [createThread("account-1", "remote-page-two")],
            }
          : {
              failedAccountIds: [],
              labelsByAccount: {},
              nextPageToken: "next-page",
              threads: [localThreads[0]],
            },
      ),
    );
    const { result } = renderHook(
      () =>
        useCombinedMailThreads({
          accounts: ACCOUNTS,
          emailAccountId: "account-1",
          enabled: true,
          isUnread: false,
        }),
      { wrapper: createWrapper(fetcher) },
    );

    await waitFor(() => {
      expect(result.current.threads).toHaveLength(20);
      expect(result.current.hasMore).toBe(true);
      expect(fetcher).toHaveBeenCalledOnce();
    });

    act(() => result.current.loadMore());

    await waitFor(() => {
      expect(result.current.threads).toHaveLength(25);
      expect(mailbox.read).toHaveBeenLastCalledWith({
        accounts: ACCOUNTS,
        limit: 40,
        query: { type: "inbox" },
      });
    });
    expect(fetcher).toHaveBeenCalledOnce();

    act(() => result.current.loadMore());

    await waitFor(() => {
      expect(fetcher).toHaveBeenCalledTimes(2);
      expect(result.current.hasMore).toBe(false);
    });
  });

  it("reconciles freshness independently for each account", async () => {
    mailbox.read.mockResolvedValue({
      accountStates: {
        "account-1": {
          ...ACCOUNT_STATES["account-1"],
          syncedAt: Number.MAX_SAFE_INTEGER,
        },
        "account-2": ACCOUNT_STATES["account-2"],
      },
      complete: true,
      missingAccountIds: [],
      threads: [
        createThread("account-1", "fresh-local", "2026-08-23T10:02:00.000Z"),
        createThread("account-2", "stale-local", "2026-08-23T09:00:00.000Z"),
      ],
      truncated: false,
    });

    const { result } = renderHook(
      () =>
        useCombinedMailThreads({
          accounts: ACCOUNTS,
          emailAccountId: "account-1",
          enabled: true,
          isUnread: false,
        }),
      {
        wrapper: createWrapper(() =>
          Promise.resolve({
            failedAccountIds: [],
            labelsByAccount: {},
            nextPageToken: null,
            threads: [
              createThread(
                "account-1",
                "stale-server",
                "2026-08-23T10:01:00.000Z",
              ),
              createThread(
                "account-2",
                "fresh-server",
                "2026-08-23T10:00:00.000Z",
              ),
            ],
          }),
        ),
      },
    );

    await waitFor(() => {
      expect(cache.write).toHaveBeenCalledOnce();
      expect(result.current.threads.map((thread) => thread.id)).toEqual([
        "fresh-local",
        "fresh-server",
      ]);
    });
  });

  it("uses an available local snapshot when that account fails remotely", async () => {
    mailbox.read.mockResolvedValue({
      accountStates: { "account-1": ACCOUNT_STATES["account-1"] },
      complete: false,
      missingAccountIds: ["account-2"],
      threads: [
        createThread("account-1", "local-fallback", "2026-08-23T10:01:00.000Z"),
      ],
      truncated: false,
    });

    const { result } = renderHook(
      () =>
        useCombinedMailThreads({
          accounts: ACCOUNTS,
          emailAccountId: "account-1",
          enabled: true,
          isUnread: false,
        }),
      {
        wrapper: createWrapper(() =>
          Promise.resolve({
            failedAccountIds: ["account-1"],
            labelsByAccount: {},
            nextPageToken: null,
            threads: [createThread("account-2", "remote")],
          }),
        ),
      },
    );

    await waitFor(() => {
      expect(cache.write).toHaveBeenCalledOnce();
      expect(result.current.threads.map((thread) => thread.id)).toEqual([
        "local-fallback",
        "remote",
      ]);
    });
  });

  it("rehydrates only when one of the displayed account stores changes", async () => {
    mailbox.read
      .mockResolvedValueOnce({
        accountStates: { "account-1": ACCOUNT_STATES["account-1"] },
        complete: false,
        missingAccountIds: ["account-2"],
        threads: [createThread("account-1", "one")],
        truncated: false,
      })
      .mockResolvedValue({
        accountStates: ACCOUNT_STATES,
        complete: true,
        missingAccountIds: [],
        threads: [
          createThread("account-2", "two"),
          createThread("account-1", "one"),
        ],
        truncated: false,
      });
    const network = Promise.withResolvers<unknown>();
    const { result } = renderHook(
      () =>
        useCombinedMailThreads({
          accounts: ACCOUNTS,
          emailAccountId: "account-1",
          enabled: true,
          isUnread: false,
        }),
      { wrapper: createWrapper(() => network.promise) },
    );
    await waitFor(() => expect(result.current.threads).toHaveLength(1));

    act(() => {
      for (const listener of mailbox.listeners) listener("other-account");
    });
    expect(mailbox.read).toHaveBeenCalledOnce();

    act(() => {
      for (const listener of mailbox.listeners) listener("account-2");
    });
    await waitFor(() => expect(result.current.threads).toHaveLength(2));
    expect(mailbox.read).toHaveBeenCalledTimes(2);
  });

  it("ignores an older mailbox read that resolves after a newer one", async () => {
    const staleRead = Promise.withResolvers<unknown>();
    const newerRead = Promise.withResolvers<unknown>();
    mailbox.read
      .mockReturnValueOnce(staleRead.promise)
      .mockReturnValueOnce(newerRead.promise);
    const network = Promise.withResolvers<unknown>();
    const { result } = renderHook(
      () =>
        useCombinedMailThreads({
          accounts: ACCOUNTS,
          emailAccountId: "account-1",
          enabled: true,
          isUnread: false,
        }),
      { wrapper: createWrapper(() => network.promise) },
    );
    await waitFor(() => expect(mailbox.read).toHaveBeenCalledOnce());

    act(() => {
      for (const listener of mailbox.listeners) listener("account-1");
    });
    await waitFor(() => expect(mailbox.read).toHaveBeenCalledTimes(2));

    await act(async () => {
      newerRead.resolve({
        accountStates: ACCOUNT_STATES,
        complete: true,
        missingAccountIds: [],
        threads: [createThread("account-1", "newer")],
        truncated: false,
      });
      await newerRead.promise;
    });
    expect(result.current.threads.map((thread) => thread.id)).toEqual([
      "newer",
    ]);

    await act(async () => {
      staleRead.resolve({
        accountStates: ACCOUNT_STATES,
        complete: true,
        missingAccountIds: [],
        threads: [createThread("account-1", "stale")],
        truncated: false,
      });
      await staleRead.promise;
    });
    expect(result.current.threads.map((thread) => thread.id)).toEqual([
      "newer",
    ]);
  });

  it("removes and restores same-id threads independently by account", async () => {
    const network = Promise.withResolvers<unknown>();
    mailbox.read.mockResolvedValue({
      accountStates: ACCOUNT_STATES,
      complete: true,
      missingAccountIds: [],
      threads: [
        createThread("account-1", "shared"),
        createThread("account-2", "shared"),
      ],
      truncated: false,
    });
    const { result } = renderHook(
      () =>
        useCombinedMailThreads({
          accounts: ACCOUNTS,
          emailAccountId: "account-1",
          enabled: true,
          isUnread: false,
        }),
      { wrapper: createWrapper(() => network.promise) },
    );
    await waitFor(() => expect(result.current.threads).toHaveLength(2));

    let removal!: ReturnType<typeof result.current.removeThreads>;
    act(() => {
      removal = result.current.removeThreads(["account-1:shared"]);
    });
    expect(result.current.threads.map((thread) => thread.account.id)).toEqual([
      "account-2",
    ]);

    act(() => result.current.restoreThreads(removal, ["account-1:shared"]));
    expect(result.current.threads.map((thread) => thread.account.id)).toEqual([
      "account-1",
      "account-2",
    ]);
  });

  it("shows a thread again after its removal is confirmed and new mail arrives", async () => {
    const freshAccountStates = createAccountStates(Number.MAX_SAFE_INTEGER);
    mailbox.read
      .mockResolvedValueOnce({
        accountStates: freshAccountStates,
        complete: true,
        missingAccountIds: [],
        threads: [createThread("account-1", "returning")],
        truncated: false,
      })
      .mockResolvedValueOnce({
        accountStates: freshAccountStates,
        complete: true,
        missingAccountIds: [],
        threads: [],
        truncated: false,
      })
      .mockResolvedValue({
        accountStates: freshAccountStates,
        complete: true,
        missingAccountIds: [],
        threads: [
          createThread("account-1", "returning", "2026-08-23T11:00:00.000Z"),
        ],
        truncated: false,
      });
    const { result } = renderHook(
      () =>
        useCombinedMailThreads({
          accounts: ACCOUNTS,
          emailAccountId: "account-1",
          enabled: true,
          isUnread: false,
        }),
      {
        wrapper: createWrapper(() =>
          Promise.resolve({
            failedAccountIds: [],
            labelsByAccount: {},
            nextPageToken: null,
            threads: [createThread("account-1", "returning")],
          }),
        ),
      },
    );
    await waitFor(() => expect(result.current.threads).toHaveLength(1));

    act(() => result.current.removeThreads(["account-1:returning"]));
    expect(result.current.threads).toHaveLength(0);

    act(() => {
      for (const listener of mailbox.listeners) listener("account-1");
    });
    await waitFor(() => expect(mailbox.read).toHaveBeenCalledTimes(2));

    act(() => {
      for (const listener of mailbox.listeners) listener("account-1");
    });
    await waitFor(() =>
      expect(result.current.threads.map((thread) => thread.id)).toEqual([
        "returning",
      ]),
    );
  });

  it("keeps a removed thread hidden until a newer sync confirms absence", async () => {
    mailbox.read
      .mockResolvedValueOnce({
        accountStates: ACCOUNT_STATES,
        complete: true,
        missingAccountIds: [],
        threads: [createThread("account-1", "provider-stale")],
        truncated: false,
      })
      .mockResolvedValueOnce({
        accountStates: ACCOUNT_STATES,
        complete: true,
        missingAccountIds: [],
        threads: [],
        truncated: false,
      })
      .mockResolvedValueOnce({
        accountStates: createAccountStates(Number.MAX_SAFE_INTEGER - 2, false),
        complete: false,
        missingAccountIds: [],
        threads: [],
        truncated: false,
      })
      .mockResolvedValueOnce({
        accountStates: createAccountStates(Number.MAX_SAFE_INTEGER - 1),
        complete: true,
        missingAccountIds: [],
        threads: [createThread("account-1", "provider-stale")],
        truncated: false,
      })
      .mockResolvedValueOnce({
        accountStates: createAccountStates(Number.MAX_SAFE_INTEGER),
        complete: true,
        missingAccountIds: [],
        threads: [],
        truncated: false,
      })
      .mockResolvedValue({
        accountStates: createAccountStates(Number.MAX_SAFE_INTEGER),
        complete: true,
        missingAccountIds: [],
        threads: [createThread("account-1", "provider-stale")],
        truncated: false,
      });
    const { result } = renderHook(
      () =>
        useCombinedMailThreads({
          accounts: ACCOUNTS,
          emailAccountId: "account-1",
          enabled: true,
          isUnread: false,
        }),
      {
        wrapper: createWrapper(() =>
          Promise.resolve({
            failedAccountIds: [],
            labelsByAccount: {},
            nextPageToken: null,
            threads: [createThread("account-1", "provider-stale")],
          }),
        ),
      },
    );
    await waitFor(() => expect(result.current.threads).toHaveLength(1));

    act(() => result.current.removeThreads(["account-1:provider-stale"]));
    expect(result.current.threads).toHaveLength(0);

    for (const expectedReadCount of [2, 3, 4]) {
      await act(async () => {
        for (const listener of mailbox.listeners) listener("account-1");
        await Promise.resolve();
      });
      await waitFor(() =>
        expect(mailbox.read).toHaveBeenCalledTimes(expectedReadCount),
      );
    }
    expect(result.current.threads).toHaveLength(0);

    await act(async () => {
      for (const listener of mailbox.listeners) listener("account-1");
      await Promise.resolve();
    });
    await waitFor(() => expect(mailbox.read).toHaveBeenCalledTimes(5));

    await act(async () => {
      for (const listener of mailbox.listeners) listener("account-1");
      await Promise.resolve();
    });
    await waitFor(() =>
      expect(result.current.threads.map((thread) => thread.id)).toEqual([
        "provider-stale",
      ]),
    );
  });

  it("does not restore a failed page-two action into the first-page cache", async () => {
    const fetcher = vi.fn((key: string) =>
      Promise.resolve(
        key.includes("cursor=next-page")
          ? {
              failedAccountIds: [],
              labelsByAccount: {},
              nextPageToken: null,
              threads: [createThread("account-2", "page-two")],
            }
          : {
              failedAccountIds: [],
              labelsByAccount: {},
              nextPageToken: "next-page",
              threads: [createThread("account-1", "page-one")],
            },
      ),
    );
    const { result } = renderHook(
      () =>
        useCombinedMailThreads({
          accounts: ACCOUNTS,
          emailAccountId: "account-1",
          enabled: true,
          isUnread: false,
        }),
      { wrapper: createWrapper(fetcher) },
    );
    await waitFor(() => expect(result.current.threads).toHaveLength(1));

    act(() => result.current.loadMore());
    await waitFor(() => expect(result.current.threads).toHaveLength(2));

    let removal!: ReturnType<typeof result.current.removeThreads>;
    act(() => {
      removal = result.current.removeThreads(["account-2:page-two"]);
      result.current.restoreThreads(removal, ["account-2:page-two"]);
    });

    await waitFor(() => expect(cache.restore).toHaveBeenCalledOnce());
    expect(cache.restore).toHaveBeenCalledWith({
      emailAccountId: "account-1",
      entries: [],
      viewKey: expect.any(String),
    });
  });

  it("updates and rolls back one account without touching a same-id thread", async () => {
    const network = Promise.withResolvers<unknown>();
    mailbox.read.mockResolvedValue({
      accountStates: ACCOUNT_STATES,
      complete: true,
      missingAccountIds: [],
      threads: [
        createThread("account-1", "shared"),
        createThread("account-2", "shared"),
      ],
      truncated: false,
    });
    const { result } = renderHook(
      () =>
        useCombinedMailThreads({
          accounts: ACCOUNTS,
          emailAccountId: "account-1",
          enabled: true,
          isUnread: false,
        }),
      { wrapper: createWrapper(() => network.promise) },
    );
    await waitFor(() => expect(result.current.threads).toHaveLength(2));

    let update!: ReturnType<typeof result.current.optimisticallyUpdateThreads>;
    act(() => {
      update = result.current.optimisticallyUpdateThreads(
        ["account-1:shared"],
        (thread) => ({ ...thread, snippet: "updated" }),
      );
    });
    expect(
      result.current.threads.map((thread) => [
        thread.account.id,
        thread.snippet,
      ]),
    ).toEqual([
      ["account-1", "updated"],
      ["account-2", "shared"],
    ]);

    act(() => update.rollback(["account-1:shared"]));
    expect(result.current.threads.map((thread) => thread.snippet)).toEqual([
      "shared",
      "shared",
    ]);
  });
});

const ACCOUNTS = [createAccount("account-1"), createAccount("account-2")];
const ACCOUNT_STATES = createAccountStates(100);

function createAccountStates(syncedAt: number, complete = true) {
  return {
    "account-1": {
      after: "2026-07-24T00:00:00.000Z",
      complete,
      syncedAt,
      truncated: false,
    },
    "account-2": {
      after: "2026-07-24T00:00:00.000Z",
      complete,
      syncedAt,
      truncated: false,
    },
  };
}

function createAccount(id: string) {
  return { email: `${id}@example.com`, id, image: null, name: id };
}

function createThread(
  accountId: string,
  id: string,
  internalDate = "2026-08-23T10:00:00.000Z",
) {
  return {
    account: createAccount(accountId),
    id,
    messages: [
      {
        date: internalDate,
        headers: { subject: id },
        id: `${id}-message`,
        internalDate,
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

function createWrapper(fetcher: (key: string) => unknown) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <SWRConfig
        value={{
          fetcher,
          provider: () => new Map(),
          shouldRetryOnError: false,
        }}
      >
        {children}
      </SWRConfig>
    );
  };
}
