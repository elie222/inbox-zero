// @vitest-environment jsdom

import type { PropsWithChildren } from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { SWRConfig } from "swr";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useLabelCounts } from "./useLabelCounts";

const mailbox = vi.hoisted(() => {
  const listeners = new Set<(emailAccountId: string) => void>();
  return {
    emit(emailAccountId: string) {
      for (const listener of listeners) listener(emailAccountId);
    },
    reset() {
      listeners.clear();
    },
    subscribe: vi.fn((listener: (emailAccountId: string) => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    }),
  };
});

vi.mock("@/utils/email-cache/mailbox", () => ({
  subscribeToMailboxStore: mailbox.subscribe,
}));

const initialResponse = {
  counts: [
    {
      id: "INBOX",
      name: "Inbox",
      kind: "system" as const,
      total: 10,
      unread: 4,
    },
  ],
  partial: false,
};

describe("useLabelCounts", () => {
  beforeEach(() => {
    mailbox.reset();
    vi.clearAllMocks();
  });

  it("refreshes when the active account mailbox changes", async () => {
    const fetcher = vi.fn().mockResolvedValue(initialResponse);
    renderHook(() => useLabelCounts({ emailAccountId: "account-1" }), {
      wrapper: createWrapper(fetcher),
    });

    await waitFor(() => expect(fetcher).toHaveBeenCalledOnce());

    act(() => mailbox.emit("account-2"));
    expect(fetcher).toHaveBeenCalledOnce();

    act(() => mailbox.emit("account-1"));
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
  });

  it("updates the inbox unread count without waiting for revalidation", async () => {
    const fetcher = vi.fn().mockResolvedValue(initialResponse);
    const { result } = renderHook(
      () => useLabelCounts({ emailAccountId: "account-1" }),
      { wrapper: createWrapper(fetcher) },
    );

    await waitFor(() =>
      expect(result.current.countsById.get("INBOX")?.unread).toBe(4),
    );

    act(() => {
      result.current.adjustInboxUnread(-1);
    });

    await waitFor(() =>
      expect(result.current.countsById.get("INBOX")?.unread).toBe(3),
    );
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it("applies an unread delta queued before counts load", async () => {
    let resolveResponse:
      | ((response: typeof initialResponse) => void)
      | undefined;
    const fetcher = vi.fn(
      () =>
        new Promise<typeof initialResponse>((resolve) => {
          resolveResponse = resolve;
        }),
    );
    const { result } = renderHook(
      () => useLabelCounts({ emailAccountId: "account-1" }),
      { wrapper: createWrapper(fetcher) },
    );

    await waitFor(() => expect(resolveResponse).toBeTypeOf("function"));
    act(() => result.current.adjustInboxUnread(-1));
    await act(async () => resolveResponse?.(initialResponse));

    await waitFor(() =>
      expect(result.current.countsById.get("INBOX")?.unread).toBe(3),
    );
  });

  it("retains an unread delta when a partial response omits the inbox", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce({ counts: [], partial: true })
      .mockResolvedValueOnce(initialResponse);
    const { result } = renderHook(
      () => useLabelCounts({ emailAccountId: "account-1" }),
      { wrapper: createWrapper(fetcher) },
    );

    await waitFor(() => expect(fetcher).toHaveBeenCalledOnce());
    act(() => result.current.adjustInboxUnread(-1));
    act(() => mailbox.emit("account-1"));

    await waitFor(() =>
      expect(result.current.countsById.get("INBOX")?.unread).toBe(3),
    );
  });

  it("discards a pending unread delta when the account changes", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce({ counts: [], partial: true })
      .mockResolvedValueOnce(initialResponse);
    const { result, rerender } = renderHook(
      ({ emailAccountId }) => useLabelCounts({ emailAccountId }),
      {
        initialProps: { emailAccountId: "account-1" },
        wrapper: createWrapper(fetcher),
      },
    );

    await waitFor(() => expect(fetcher).toHaveBeenCalledOnce());
    act(() => result.current.adjustInboxUnread(-1));
    rerender({ emailAccountId: "account-2" });
    act(() => mailbox.emit("account-2"));

    await waitFor(() =>
      expect(result.current.countsById.get("INBOX")?.unread).toBe(4),
    );
  });

  it("ignores an unread update resumed from the previous account", async () => {
    const fetcher = vi.fn().mockResolvedValue(initialResponse);
    const { result, rerender } = renderHook(
      ({ emailAccountId }) => useLabelCounts({ emailAccountId }),
      {
        initialProps: { emailAccountId: "account-1" },
        wrapper: createWrapper(fetcher),
      },
    );

    await waitFor(() =>
      expect(result.current.countsById.get("INBOX")?.unread).toBe(4),
    );
    const previousAccountAdjustInboxUnread = result.current.adjustInboxUnread;
    rerender({ emailAccountId: "account-2" });
    act(() => previousAccountAdjustInboxUnread(-1));

    expect(result.current.countsById.get("INBOX")?.unread).toBe(4);
  });
});

function createWrapper(fetcher: () => unknown) {
  const Wrapper = ({ children }: PropsWithChildren) => (
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

  return Wrapper;
}
