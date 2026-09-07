// @vitest-environment jsdom
import type { ReactNode } from "react";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import useSWR, { SWRConfig, unstable_serialize, useSWRConfig } from "swr";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  connectThreadCacheInvalidation,
  invalidateThreadCaches,
} from "./thread-invalidation";

afterEach(cleanup);

describe("thread cache invalidation", () => {
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
