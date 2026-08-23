// @vitest-environment jsdom

import type { ReactNode } from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { SWRConfig } from "swr";
import { beforeEach, describe, expect, it, vi } from "vitest";
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

  it("renders a complete merged mailbox while the server revalidates", async () => {
    const network = Promise.withResolvers<unknown>();
    mailbox.read.mockResolvedValue({
      accountStates: ACCOUNT_STATES,
      complete: true,
      missingAccountIds: [],
      syncedAt: 100,
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
      syncedAt: 100,
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

    await waitFor(() => expect(cache.write).toHaveBeenCalledOnce());
    expect(result.current.threads.map((thread) => thread.id)).toEqual([
      "canonical",
      "stale-recent",
      "older-than-local-window",
    ]);
    expect(result.current.threads[0]?.snippet).toBe("remote");
  });

  it("keeps a complete canonical snapshot after it syncs more recently than the server page", async () => {
    mailbox.read.mockResolvedValue({
      accountStates: ACCOUNT_STATES,
      complete: true,
      missingAccountIds: [],
      syncedAt: Number.MAX_SAFE_INTEGER,
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

    await waitFor(() => expect(cache.write).toHaveBeenCalledOnce());
    expect(result.current.threads.map((thread) => thread.id)).toEqual([
      "canonical",
      "older-than-local-window",
    ]);
    expect(result.current.threads[0]?.snippet).toBe("canonical");
  });

  it("keeps valid next-page rows when the combined mailbox is truncated", async () => {
    mailbox.read.mockResolvedValue({
      accountStates: ACCOUNT_STATES,
      complete: true,
      missingAccountIds: [],
      syncedAt: Number.MAX_SAFE_INTEGER,
      threads: [createThread("account-1", "canonical")],
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

    await waitFor(() => expect(cache.write).toHaveBeenCalledOnce());
    expect(result.current.threads.map((thread) => thread.id)).toEqual([
      "canonical",
      "valid-next-page-row",
    ]);
  });

  it("rehydrates only when one of the displayed account stores changes", async () => {
    mailbox.read
      .mockResolvedValueOnce({
        accountStates: { "account-1": ACCOUNT_STATES["account-1"] },
        complete: false,
        missingAccountIds: ["account-2"],
        syncedAt: 100,
        threads: [createThread("account-1", "one")],
        truncated: false,
      })
      .mockResolvedValue({
        accountStates: ACCOUNT_STATES,
        complete: true,
        missingAccountIds: [],
        syncedAt: 200,
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

  it("removes and restores same-id threads independently by account", async () => {
    const network = Promise.withResolvers<unknown>();
    mailbox.read.mockResolvedValue({
      accountStates: ACCOUNT_STATES,
      complete: true,
      missingAccountIds: [],
      syncedAt: 100,
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
      syncedAt: 100,
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
const ACCOUNT_STATES = {
  "account-1": {
    after: "2026-07-24T00:00:00.000Z",
    syncedAt: 100,
    truncated: false,
  },
  "account-2": {
    after: "2026-07-24T00:00:00.000Z",
    syncedAt: 100,
    truncated: false,
  },
};

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
