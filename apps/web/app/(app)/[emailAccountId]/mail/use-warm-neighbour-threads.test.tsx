/** @vitest-environment jsdom */

import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import type { MailClient } from "@inboxzero/mail-core/engine";
import type { ConversationView } from "@inboxzero/mail-core/ports/mail-store";
import type { QuerySnapshot } from "@inboxzero/mail-core/queries";
import { MailEngineProvider } from "@inboxzero/mail-react/MailEngineProvider";
import type { ListThread } from "./types";
import { useWarmNeighbourThreads } from "./use-warm-neighbour-threads";

describe("useWarmNeighbourThreads", () => {
  it("holds the open conversation and its list neighbours, releasing ones that fall out of range", () => {
    const client = fakeClient();
    const threads = ["t1", "t2", "t3", "t4"].map(listThread);

    const { rerender, unmount } = renderHook(
      ({ activeThreadKey }: { activeThreadKey: string | null }) =>
        useWarmNeighbourThreads({
          threads,
          activeThreadKey,
          emailAccountId: "acc-1",
        }),
      {
        initialProps: { activeThreadKey: "t2" as string | null },
        wrapper: client.wrapper,
      },
    );

    expect(client.openKeys()).toEqual(["t1", "t2", "t3"]);
    expect(client.observeConversation).toHaveBeenCalledWith(
      { accountId: "acc-1", conversationId: "t1" },
      { after: null, pageSize: 50 },
    );

    rerender({ activeThreadKey: "t3" });
    expect(client.openKeys()).toEqual(["t2", "t3", "t4"]);
    // t2 and t3 stay held across the move so the reader joins a warm group.
    expect(client.observeConversation).toHaveBeenCalledTimes(4);

    rerender({ activeThreadKey: null });
    expect(client.openKeys()).toEqual([]);

    rerender({ activeThreadKey: "t4" });
    unmount();
    expect(client.openKeys()).toEqual([]);
  });

  it("keeps its neighbours while the open thread leaves the list, as when archiving advances the reader", () => {
    const client = fakeClient();
    const { rerender } = renderHook(
      ({ threads }: { threads: ListThread[] }) =>
        useWarmNeighbourThreads({
          threads,
          activeThreadKey: "t2",
          emailAccountId: "acc-1",
        }),
      {
        initialProps: { threads: ["t1", "t2", "t3"].map(listThread) },
        wrapper: client.wrapper,
      },
    );

    rerender({ threads: ["t1", "t3"].map(listThread) });
    expect(client.openKeys()).toEqual(["t1", "t2", "t3"]);
  });

  it("moves its observations to a new mail client", () => {
    const first = fakeClient();
    const second = fakeClient();
    let client = first;
    const { rerender } = renderHook(
      () =>
        useWarmNeighbourThreads({
          threads: ["t1", "t2"].map(listThread),
          activeThreadKey: "t1",
          emailAccountId: "acc-1",
        }),
      {
        wrapper: ({ children }: { children: ReactNode }) =>
          client.wrapper({ children }),
      },
    );
    expect(first.openKeys()).toEqual(["t1", "t2"]);

    client = second;
    rerender();
    expect(first.openKeys()).toEqual([]);
    expect(second.openKeys()).toEqual(["t1", "t2"]);
  });

  it("warms one hovered thread at a time beside the held neighbours", () => {
    const client = fakeClient();
    const { result, unmount } = renderHook(
      () =>
        useWarmNeighbourThreads({
          threads: ["t1", "t2", "t3", "t4", "t5"].map(listThread),
          activeThreadKey: "t1",
          emailAccountId: "acc-1",
        }),
      { wrapper: client.wrapper },
    );

    act(() => result.current(listThread("t4")));
    expect(client.openKeys()).toEqual(["t1", "t2", "t4"]);
    act(() => result.current(listThread("t2")));
    expect(client.openKeys()).toEqual(["t1", "t2", "t4"]);
    act(() => result.current(listThread("t5")));
    expect(client.openKeys()).toEqual(["t1", "t2", "t5"]);

    unmount();
    expect(client.openKeys()).toEqual([]);
  });

  it("requests a neighbour's missing bodies once per message across snapshot updates", () => {
    const client = fakeClient();
    renderHook(
      () =>
        useWarmNeighbourThreads({
          threads: [listThread("t1"), listThread("t2")],
          activeThreadKey: "t1",
          emailAccountId: "acc-1",
        }),
      { wrapper: client.wrapper },
    );

    act(() => client.publish("t2", conversation("t2", ["m1", "m2"])));
    act(() => client.publish("t2", conversation("t2", ["m1", "m2"])));

    expect(client.ensureMessageContent.mock.calls).toEqual([
      [{ accountId: "acc-1", messageId: "m1" }],
      [{ accountId: "acc-1", messageId: "m2" }],
    ]);
  });
});

function fakeClient() {
  const handles = new Map<
    string,
    {
      snapshot: QuerySnapshot<ConversationView>;
      listeners: Set<() => void>;
      closed: boolean;
    }
  >();
  const observeConversation = vi.fn(
    (key: { accountId: string; conversationId: string }) => {
      const state = {
        snapshot: {
          status: "loading",
          revision: null,
          data: null,
          refreshing: true,
          error: null,
        } as QuerySnapshot<ConversationView>,
        listeners: new Set<() => void>(),
        closed: false,
      };
      handles.set(key.conversationId, state);
      return {
        getSnapshot: () => state.snapshot,
        subscribe: (listener: () => void) => {
          state.listeners.add(listener);
          return () => state.listeners.delete(listener);
        },
        close: () => {
          state.closed = true;
        },
      };
    },
  );
  const ensureMessageContent = vi.fn(async () => ({
    status: "scheduled" as const,
  }));
  const client = {
    observeConversation,
    ensureMessageContent,
  } as unknown as MailClient;
  return {
    observeConversation,
    ensureMessageContent,
    wrapper: ({ children }: { children: ReactNode }) => (
      <MailEngineProvider client={client}>{children}</MailEngineProvider>
    ),
    openKeys: () =>
      [...handles.entries()]
        .filter(([, state]) => !state.closed)
        .map(([key]) => key)
        .sort(),
    publish(conversationId: string, view: ConversationView) {
      const state = handles.get(conversationId);
      if (!state) throw new Error(`${conversationId} is not observed`);
      state.snapshot = {
        status: "ready",
        revision: { databaseEpoch: "db", sequence: 1 },
        data: view,
        refreshing: false,
        error: null,
      };
      for (const listener of state.listeners) listener();
    },
  };
}

function listThread(id: string) {
  return { id, messages: [] } as unknown as ListThread;
}

function conversation(
  conversationId: string,
  messageIds: string[],
): ConversationView {
  return {
    key: { accountId: "acc-1", conversationId },
    messages: messageIds.map((messageId) => ({
      key: { accountId: "acc-1", messageId },
      metadata: {} as ConversationView["messages"][number]["metadata"],
      content: { status: "not_requested" },
      pendingOperationIds: [],
    })),
    nextPage: null,
    coverage: [],
  };
}
