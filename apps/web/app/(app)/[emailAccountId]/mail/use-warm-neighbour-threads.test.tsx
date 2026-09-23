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
      ({ openThreadKey }: { openThreadKey: string | null }) =>
        useWarmNeighbourThreads({
          threads,
          openThreadKey,
          emailAccountId: "acc-1",
        }),
      {
        initialProps: { openThreadKey: "t2" as string | null },
        wrapper: client.wrapper,
      },
    );

    expect(client.openKeys()).toEqual(["t1", "t2", "t3"]);
    expect(client.observeConversation).toHaveBeenCalledWith(
      { accountId: "acc-1", conversationId: "t1" },
      { after: null, pageSize: 50 },
    );

    rerender({ openThreadKey: "t3" });
    expect(client.openKeys()).toEqual(["t2", "t3", "t4"]);
    // t2 and t3 stay held across the move so the reader joins a warm group.
    expect(client.observeConversation).toHaveBeenCalledTimes(4);

    rerender({ openThreadKey: null });
    expect(client.openKeys()).toEqual([]);

    rerender({ openThreadKey: "t4" });
    unmount();
    expect(client.openKeys()).toEqual([]);
  });

  it("requests missing bodies once per message across snapshot updates", () => {
    const client = fakeClient();
    renderHook(
      () =>
        useWarmNeighbourThreads({
          threads: [listThread("t1"), listThread("t2")],
          openThreadKey: "t1",
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
