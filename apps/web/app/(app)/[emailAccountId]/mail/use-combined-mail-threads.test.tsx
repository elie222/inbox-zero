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

vi.mock("@/utils/email-cache/thread-lists", () => ({
  readCachedThreadList: cache.read,
  removeCachedThreadsFromView: cache.remove,
  restoreCachedThreadsToView: cache.restore,
  writeCachedThreadList: cache.write,
}));

describe("useCombinedMailThreads", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cache.remove.mockResolvedValue(undefined);
    cache.restore.mockResolvedValue(undefined);
    cache.write.mockResolvedValue(undefined);
  });

  it("shows a cached first page while all accounts revalidate", async () => {
    const network = Promise.withResolvers<unknown>();
    const cachedThread = createThread("account-1", "cached");
    cache.read.mockResolvedValue({
      cachedAt: 100,
      hasMore: true,
      threads: [
        {
          id: "account-1:cached",
          thread: cachedThread,
        },
      ],
    });

    const { result } = renderHook(
      () =>
        useCombinedMailThreads({
          emailAccountId: "account-1",
          enabled: true,
          isUnread: false,
        }),
      { wrapper: createWrapper(() => network.promise) },
    );

    await waitFor(() => {
      expect(result.current.threads).toEqual([cachedThread]);
      expect(result.current.isLoading).toBe(false);
      expect(result.current.hasMore).toBe(true);
    });
    expect(cache.read).toHaveBeenCalledWith(
      expect.objectContaining({ emailAccountId: "account-1" }),
    );
  });

  it("persists and restores selected rows using their account-scoped keys", async () => {
    cache.read.mockResolvedValue(undefined);
    const first = createThread("account-1", "shared");
    const second = createThread("account-2", "shared");
    const { result } = renderHook(
      () =>
        useCombinedMailThreads({
          emailAccountId: "account-1",
          enabled: true,
          isUnread: false,
        }),
      {
        wrapper: createWrapper(() =>
          Promise.resolve({
            threads: [first, second],
            labelsByAccount: {},
            failedAccountIds: [],
            nextPageToken: null,
          }),
        ),
      },
    );
    await waitFor(() => expect(result.current.threads).toHaveLength(2));
    await waitFor(() =>
      expect(cache.write).toHaveBeenCalledWith(
        expect.objectContaining({
          emailAccountId: "account-1",
          threads: [
            { id: "account-1:shared", thread: first },
            { id: "account-2:shared", thread: second },
          ],
        }),
      ),
    );

    let removal!: ReturnType<typeof result.current.removeThreads>;
    act(() => {
      removal = result.current.removeThreads([
        "account-1:shared",
        "account-2:shared",
      ]);
    });
    expect(result.current.threads).toEqual([]);
    expect(cache.remove).toHaveBeenCalledWith(
      expect.objectContaining({
        threadIds: ["account-1:shared", "account-2:shared"],
      }),
    );

    act(() => {
      result.current.restoreThreads(removal, ["account-2:shared"]);
    });
    expect(result.current.threads).toEqual([second]);
    expect(cache.restore).toHaveBeenCalledWith(
      expect.objectContaining({
        entries: [
          expect.objectContaining({
            thread: { id: "account-2:shared", thread: second },
          }),
        ],
      }),
    );
  });
});

function createThread(accountId: string, threadId: string) {
  return {
    id: threadId,
    messages: [
      {
        id: `${threadId}-message`,
        threadId,
        snippet: threadId,
        subject: threadId,
        date: "0",
        internalDate: "0",
        labelIds: ["INBOX"],
        headers: { subject: threadId },
      },
    ],
    plan: undefined,
    plans: [],
    snippet: threadId,
    account: {
      id: accountId,
      email: `${accountId}@example.com`,
      name: null,
      image: null,
    },
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
