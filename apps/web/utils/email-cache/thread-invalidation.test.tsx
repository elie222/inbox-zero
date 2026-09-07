// @vitest-environment jsdom
import "fake-indexeddb/auto";
import type { ReactNode } from "react";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import useSWR, { SWRConfig, unstable_serialize, useSWRConfig } from "swr";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  connectThreadCacheInvalidation,
  invalidateThreadCaches,
  getThreadCacheVersion,
} from "./thread-invalidation";

import { clearEmailCache, getEmailCacheDatabase } from "./database";

const broadcast = vi.hoisted(() => {
  const state = {
    receive: undefined as ((event: MessageEvent) => void) | undefined,
  };
  vi.stubGlobal(
    "BroadcastChannel",
    class {
      addEventListener(_type: string, listener: (event: MessageEvent) => void) {
        state.receive = listener;
      }
      postMessage() {}
    },
  );
  return state;
});

beforeEach(async () => {
  await clearEmailCache();
});

afterEach(cleanup);

describe("thread cache invalidation", () => {
  it("clears stale persisted rows when another tab invalidates a thread", async () => {
    const database = await getEmailCacheDatabase();
    if (!database) throw new Error("Database unavailable");
    for (const account of ["account-1", "account-2"]) {
      await database.put("threadDetails", {
        emailAccountId: account,
        threadId: "thread-1",
        variant: "drafts:1|replies:0",
        data: { thread: { id: "thread-1", messages: [] } },
        fetchedAt: 1,
        lastAccessedAt: 1,
        byteSize: 1,
      });
    }
    const version = getThreadCacheVersion("account-1", "thread-1");
    broadcast.receive?.(
      new MessageEvent("message", {
        data: {
          emailAccountId: "account-1",
          threadIds: ["thread-1"],
          reset: false,
        },
      }),
    );
    await waitFor(async () =>
      expect(
        await database.get("threadDetails", [
          "account-1",
          "thread-1",
          "drafts:1|replies:0",
        ]),
      ).toBeUndefined(),
    );
    expect(
      await database.get("threadDetails", [
        "account-2",
        "thread-1",
        "drafts:1|replies:0",
      ]),
    ).toBeDefined();
    expect(getThreadCacheVersion("account-1", "thread-1")).not.toBe(version);
  });

  it("does not refresh memory when cross-tab persisted deletion fails", async () => {
    const database = await getEmailCacheDatabase();
    if (!database) throw new Error("Database unavailable");
    const transaction = vi
      .spyOn(database, "transaction")
      .mockImplementationOnce(() => {
        throw new Error("Storage unavailable");
      });
    const mutate = vi.fn().mockResolvedValue(undefined);
    const disconnect = connectThreadCacheInvalidation(new Map(), mutate);
    try {
      await act(async () => {
        broadcast.receive?.(
          new MessageEvent("message", {
            data: { emailAccountId: "account-1", threadIds: [], reset: true },
          }),
        );
      });
      expect(transaction).toHaveBeenCalled();
      expect(mutate).not.toHaveBeenCalled();
    } finally {
      transaction.mockRestore();
      disconnect();
    }
  });

  it("refreshes only affected account and thread variants", async () => {
    const fetcher = vi.fn().mockResolvedValue("cached");
    const { result } = renderHook(
      () => ({
        plain: useSWR(["/api/threads/thread-1", "account-1"]).data,
        drafts: useSWR([
          "/api/threads/thread-1?includeDrafts=true",
          "account-1",
        ]).data,
        unrelated: useSWR(["/api/threads/thread-2", "account-1"]).data,
        otherAccount: useSWR(["/api/threads/thread-1", "account-2"]).data,
        mutate: useSWRConfig().mutate,
        cache: useSWRConfig().cache,
      }),
      {
        wrapper: ({ children }: { children: ReactNode }) => (
          <SWRConfig value={{ provider: () => new Map(), fetcher }}>
            {children}
          </SWRConfig>
        ),
      },
    );
    await waitFor(() => expect(result.current.otherAccount).toBe("cached"));
    const prefetchedKey = [
      "/api/threads/thread-1?parseReplies=true",
      "account-1",
    ];
    await act(async () => {
      await result.current.mutate(
        prefetchedKey,
        { thread: { id: "thread-1" } },
        { revalidate: false },
      );
    });
    const disconnect = connectThreadCacheInvalidation(
      result.current.cache,
      result.current.mutate,
    );
    try {
      fetcher.mockClear().mockResolvedValue("current");
      await act(async () =>
        invalidateThreadCaches({
          emailAccountId: "account-1",
          threadIds: ["thread-1"],
          reset: false,
        }),
      );
      await waitFor(() => expect(result.current.drafts).toBe("current"));
      expect(result.current.plain).toBe("current");
      expect(result.current.unrelated).toBe("cached");
      expect(result.current.otherAccount).toBe("cached");
      expect(fetcher).toHaveBeenCalledTimes(2);
      expect(
        result.current.cache.get(unstable_serialize(prefetchedKey))?.data,
      ).toBeUndefined();
      fetcher.mockClear();
      await act(async () =>
        invalidateThreadCaches({
          emailAccountId: "account-1",
          threadIds: [],
          reset: false,
        }),
      );
      expect(fetcher).not.toHaveBeenCalled();
    } finally {
      disconnect();
    }
  });
});
