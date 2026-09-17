// @vitest-environment jsdom

import type { ReactNode } from "react";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { SWRConfig, unstable_serialize } from "swr";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mockDeep } from "vitest-mock-extended";
import { notifyEmailCacheChange } from "@/utils/email-cache/cache-events";
import type { MailMutation } from "@/utils/email-cache/mail-mutations";
import { useRetainedMailMutationOverlay } from "./useMailMutationOverlay";
import { useThread } from "./useThread";

const cache = vi.hoisted(() => ({
  read: vi.fn(),
  localRead: vi.fn(),
  write: vi.fn(),
}));

vi.mock("@/utils/email-cache/local-mail-reader", () => ({
  readLocalMailThreadPage: cache.localRead,
  keepLocalMailThreadOpen: () => () => {},
}));

vi.mock("./useMailMutationOverlay", () => ({
  useRetainedMailMutationOverlay: vi.fn(),
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
    vi.mocked(useRetainedMailMutationOverlay).mockReturnValue({
      mutations: [],
      isReady: true,
      isReadable: true,
      retainMutations: vi.fn(),
    });
    cache.write.mockResolvedValue(undefined);
    cache.localRead.mockResolvedValue(undefined);
    cache.read.mockResolvedValue(undefined);
  });

  it.each([
    true,
    false,
  ])("preserves pending starred=%s over an older detail response", async (starred) => {
    const originalLabels = starred ? ["INBOX"] : ["INBOX", "STARRED"];
    const data = {
      thread: {
        id: "thread-1",
        messages: [{ id: "message-1", labelIds: originalLabels }],
      },
    };
    cache.read.mockResolvedValue(undefined);
    vi.mocked(useRetainedMailMutationOverlay).mockReturnValue({
      mutations: [
        mockDeep<MailMutation>({
          id: "star-1",
          emailAccountId: "account-1",
          threadId: "thread-1",
          messageIds: ["message-1"],
          kind: "set_starred_state",
          starred,
          createdAt: 1,
        }),
      ],
      isReady: true,
      isReadable: true,
      retainMutations: vi.fn(),
    });
    const { result } = renderHook(() => useThread({ id: "thread-1" }), {
      wrapper: createWrapper(vi.fn().mockResolvedValue(data)),
    });
    await waitFor(() =>
      expect(result.current.data?.thread.messages[0]?.labelIds).toEqual(
        starred ? ["INBOX", "STARRED"] : ["INBOX"],
      ),
    );
    expect(data.thread.messages[0]?.labelIds).toEqual(originalLabels);
  });

  it.each([
    { payload: { kind: "archive" as const }, emailAccountId: "account-1" },
    {
      payload: { kind: "set_starred_state" as const, starred: true },
      emailAccountId: "account-2",
    },
    {
      payload: { kind: "set_read_state" as const, read: true },
      emailAccountId: "account-1",
    },
  ])("keeps reader messages intact for $payload.kind from $emailAccountId", async ({
    payload,
    emailAccountId,
  }) => {
    const data = {
      thread: {
        id: "thread-1",
        messages: [{ id: "message-1", labelIds: ["INBOX", "UNREAD"] }],
      },
    };
    cache.read.mockResolvedValue(undefined);
    vi.mocked(useRetainedMailMutationOverlay).mockReturnValue({
      mutations: [
        mockDeep<MailMutation>({
          id: "mutation-1",
          emailAccountId,
          threadId: "thread-1",
          messageIds: ["message-1"],
          ...payload,
          createdAt: 1,
        }),
      ],
      isReady: true,
      isReadable: true,
      retainMutations: vi.fn(),
    });
    const { result } = renderHook(() => useThread({ id: "thread-1" }), {
      wrapper: createWrapper(vi.fn().mockResolvedValue(data)),
    });
    await waitFor(() => expect(result.current.data).toEqual(data));
  });

  it("shows canonical mail before the provider completes and then reconciles", async () => {
    const network = Promise.withResolvers<unknown>();
    const message = {
      id: "message-1",
      threadId: "thread-1",
      headers: {},
      labelIds: [],
      textPlain: "cached body",
    };
    cache.localRead.mockResolvedValue({
      generation: "generation-1",
      messages: [{ message, bodyAvailable: true, fetchedAt: 100 }],
    });
    const fetcher = vi.fn().mockReturnValue(network.promise);
    const { result } = renderHook(
      () => useThread({ id: "thread-1" }, { localMail: true }),
      { wrapper: createWrapper(fetcher) },
    );
    await waitFor(() =>
      expect(result.current.data?.thread.messages[0]?.textPlain).toBe(
        "cached body",
      ),
    );
    expect(result.current.localAvailability?.providerConfirmed).toBe(false);
    expect(result.current.isLoading).toBe(false);
    const data = {
      thread: {
        id: "thread-1",
        messages: [{ ...message, textPlain: "fresh body" }],
      },
    };
    cache.write.mockImplementationOnce(async () => {
      cache.localRead.mockResolvedValue({
        generation: "generation-1",
        messages: [
          {
            message: data.thread.messages[0],
            bodyAvailable: true,
            fetchedAt: Date.now(),
          },
        ],
      });
      notifyEmailCacheChange("account-1");
    });
    await act(async () => network.resolve(data));
    await waitFor(() =>
      expect(result.current.data?.thread.messages[0].textPlain).toBe(
        "fresh body",
      ),
    );
    expect(result.current.localAvailability?.providerConfirmed).toBe(true);
  });

  it("loads another retained page without treating the first page as the whole conversation", async () => {
    cache.localRead.mockImplementation(async ({ before }) => ({
      generation: "generation-1",
      messages: [
        {
          message: {
            id: before ? "message-2" : "message-1",
            threadId: "thread-pages",
            headers: {},
            labelIds: [],
          },
          bodyAvailable: true,
          fetchedAt: 100,
        },
      ],
      next: before ? undefined : { receivedAt: 100, messageId: "message-1" },
    }));
    const { result } = renderHook(
      () => useThread({ id: "thread-pages" }, { localMail: true }),
      {
        wrapper: createWrapper(vi.fn().mockRejectedValue(new Error("Offline"))),
      },
    );
    await waitFor(() =>
      expect(result.current.localAvailability?.hasMore).toBe(true),
    );
    await act(async () => {
      await result.current.localAvailability?.loadMore();
    });
    await waitFor(() =>
      expect(
        result.current.data?.thread.messages.map((message) => message.id),
      ).toEqual(["message-2", "message-1"]),
    );
    expect(result.current.localAvailability?.hasMore).toBe(false);
    expect(result.current.localAvailability).toBeDefined();
  });

  it("updates an old in-memory conversation from canonical changes without polling the provider", async () => {
    const oldMessage = {
      id: "message-1",
      threadId: "thread-current",
      headers: {},
      labelIds: [],
      textPlain: "old body",
    };
    const memoryCache = new Map([
      [
        unstable_serialize(["/api/threads/thread-current", "account-1"]),
        { data: { thread: { id: "thread-current", messages: [oldMessage] } } },
      ],
    ]);
    const fetcher = vi.fn();
    cache.localRead.mockResolvedValue({
      generation: "generation-1",
      messages: [{ message: oldMessage, bodyAvailable: true, fetchedAt: 100 }],
    });
    const { result } = renderHook(
      () => useThread({ id: "thread-current" }, { localMail: true }),
      { wrapper: createWrapper(fetcher, { cache: memoryCache }) },
    );
    await waitFor(() => expect(result.current.localAvailability).toBeDefined());
    cache.localRead.mockResolvedValue({
      generation: "generation-1",
      messages: [
        {
          message: { ...oldMessage, textPlain: "new body" },
          bodyAvailable: true,
          fetchedAt: 200,
        },
        {
          message: { ...oldMessage, id: "reply", textPlain: "new reply" },
          bodyAvailable: true,
          fetchedAt: 200,
        },
      ],
    });
    await act(async () => notifyEmailCacheChange("account-1"));
    await waitFor(() =>
      expect(result.current.data?.thread.messages).toHaveLength(2),
    );
    expect(result.current.data?.thread.messages[0].textPlain).toBe("new body");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("offers the next local page even when a page contains only filtered drafts", async () => {
    cache.localRead.mockImplementation(async ({ before }) => ({
      generation: "generation-1",
      messages: before
        ? [
            {
              message: {
                id: "older",
                threadId: "thread-filtered",
                headers: {},
                labelIds: [],
              },
              bodyAvailable: true,
              fetchedAt: 100,
            },
          ]
        : [],
      next: before ? undefined : { receivedAt: 100, messageId: "draft" },
      hasRetainedThread: true,
    }));
    const { result } = renderHook(
      () => useThread({ id: "thread-filtered" }, { localMail: true }),
      {
        wrapper: createWrapper(vi.fn().mockRejectedValue(new Error("Offline"))),
      },
    );
    await waitFor(() =>
      expect(result.current.localAvailability?.hasMore).toBe(true),
    );
    await act(async () => {
      await result.current.localAvailability?.loadMore();
    });
    await waitFor(() =>
      expect(result.current.data?.thread.messages[0].id).toBe("older"),
    );
  });

  it("keeps unavailable bodies explicit after a network failure", async () => {
    cache.localRead.mockResolvedValue({
      generation: "generation-1",
      messages: [
        {
          message: {
            id: "message-1",
            threadId: "thread-1",
            headers: {},
            labelIds: [],
          },
          bodyAvailable: false,
          fetchedAt: 100,
        },
      ],
    });
    const { result } = renderHook(
      () => useThread({ id: "thread-1" }, { localMail: true }),
      {
        wrapper: createWrapper(vi.fn().mockRejectedValue(new Error("Offline"))),
      },
    );
    await waitFor(() =>
      expect(
        result.current.localAvailability?.missingBodyIds.has("message-1"),
      ).toBe(true),
    );
    expect(result.current.error).toBeUndefined();
    expect(result.current.data?.thread.messages[0].textPlain).toBeUndefined();
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
