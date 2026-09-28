/** @vitest-environment jsdom */

import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import type { MailClient } from "@inboxzero/mail-core/engine";
import { MailEngineProvider } from "@inboxzero/mail-react/MailEngineProvider";
import type {
  MailboxView,
  MailPredicate,
  QuerySnapshot,
} from "@inboxzero/mail-core/queries";
import type { ThreadsQuery } from "@/utils/threads/validation";
import { useEngineMailThreads } from "./use-engine-mail-threads";

function wrapper({ children }: { children: ReactNode }) {
  return <MailEngineProvider client={null}>{children}</MailEngineProvider>;
}

describe("useEngineMailThreads", () => {
  it("keeps the disabled empty result stable across query identity changes", async () => {
    const { result, rerender } = renderHook(
      ({ query }: { query: ThreadsQuery }) =>
        useEngineMailThreads({
          emailAccountId: "acc-1",
          query,
          enabled: false,
        }),
      {
        initialProps: { query: { type: "inbox" } as ThreadsQuery },
        wrapper,
      },
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    const emptyThreads = result.current.threads;

    rerender({ query: { type: "inbox" } as ThreadsQuery });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.threads).toBe(emptyThreads);
  });

  it("does not claim load-more support when the client only exposes a single mailbox page", async () => {
    const observeMailbox = vi.fn(() => staticMailboxHandle(mailboxSnapshot()));
    const client = {
      observeMailbox,
      observeConversation: vi.fn(),
      observeOperation: vi.fn(),
      submitMetadata: vi.fn(),
      submitConversations: vi.fn(),
      saveDraft: vi.fn(),
      readDraft: vi.fn(),
      submitSend: vi.fn(),
      cancelOperation: vi.fn(),
      requestSync: vi.fn(async () => ({ status: "scheduled" as const })),
      ensureMessageContent: vi.fn(),
      getDiagnostics: vi.fn(async () => ({
        accountId: "acc-1",
        revision: { databaseEpoch: "e1", sequence: 1 },
        connection: "ready" as const,
        coverage: [],
        pendingOperations: 0,
        uncertainOperations: 0,
        pendingJobs: 0,
        oldestPendingAtMs: null,
        commands: [],
      })),
      purgeAccount: vi.fn(),
    } as unknown as MailClient;
    const clientWrapper = ({ children }: { children: ReactNode }) => (
      <MailEngineProvider client={client}>{children}</MailEngineProvider>
    );

    const { result } = renderHook(
      () =>
        useEngineMailThreads({
          emailAccountId: "acc-1",
          query: { type: "inbox" } as ThreadsQuery,
        }),
      { wrapper: clientWrapper },
    );

    await waitFor(() => expect(result.current.threads).toHaveLength(1));
    expect(result.current.hasMore).toBe(false);

    await result.current.loadMore();

    expect(observeMailbox).toHaveBeenCalledTimes(1);
  });

  it("passes explicit account-scoped predicates to the engine", async () => {
    const predicate: MailPredicate = {
      kind: "all",
      predicates: [
        { kind: "role", role: "inbox" },
        {
          kind: "any",
          predicates: [
            {
              kind: "membership",
              membership: "label",
              id: "shared",
              accountId: "acc-1",
            },
          ],
        },
      ],
    };
    const observeMailbox = vi.fn(() => staticMailboxHandle(mailboxSnapshot()));
    const client = {
      observeMailbox,
      observeConversation: vi.fn(),
      observeOperation: vi.fn(),
      submitMetadata: vi.fn(),
      submitConversations: vi.fn(),
      saveDraft: vi.fn(),
      readDraft: vi.fn(),
      submitSend: vi.fn(),
      cancelOperation: vi.fn(),
      requestSync: vi.fn(async () => ({ status: "scheduled" as const })),
      ensureMessageContent: vi.fn(),
      getDiagnostics: vi.fn(),
      purgeAccount: vi.fn(),
    } as unknown as MailClient;
    const clientWrapper = ({ children }: { children: ReactNode }) => (
      <MailEngineProvider client={client}>{children}</MailEngineProvider>
    );

    renderHook(
      () =>
        useEngineMailThreads({
          emailAccountId: "acc-1",
          accountIds: ["acc-1", "acc-2"],
          query: { type: "inbox" } as ThreadsQuery,
          predicate,
        }),
      { wrapper: clientWrapper },
    );

    await waitFor(() => expect(observeMailbox).toHaveBeenCalled());
    expect(observeMailbox).toHaveBeenCalledWith(
      expect.objectContaining({
        accountIds: ["acc-1", "acc-2"],
        predicate,
      }),
    );
  });

  it("keeps unchanged rows when a pushed snapshot edits another conversation", async () => {
    let snapshot = mailboxSnapshot([conversation("c-1"), conversation("c-2")]);
    const listeners = new Set<() => void>();
    const push = (next: QuerySnapshot<MailboxView>) => {
      snapshot = next;
      for (const listener of listeners) listener();
    };
    const client = {
      observeMailbox: vi.fn(() => ({
        getSnapshot: () => snapshot,
        subscribe: (listener: () => void) => {
          listeners.add(listener);
          return () => listeners.delete(listener);
        },
        close: () => undefined,
      })),
      requestSync: vi.fn(async () => ({ status: "scheduled" as const })),
    } as unknown as MailClient;
    const clientWrapper = ({ children }: { children: ReactNode }) => (
      <MailEngineProvider client={client}>{children}</MailEngineProvider>
    );
    const { result } = renderHook(
      () =>
        useEngineMailThreads({
          emailAccountId: "acc-1",
          query: { type: "inbox" } as ThreadsQuery,
        }),
      { wrapper: clientWrapper },
    );
    await waitFor(() => expect(result.current.threads).toHaveLength(2));
    const [first, second] = result.current.threads;

    act(() =>
      push(
        mailboxSnapshot([
          conversation("c-1"),
          { ...conversation("c-2"), starred: true },
        ]),
      ),
    );

    expect(result.current.threads[0]).toBe(first);
    expect(result.current.threads[1]).not.toBe(second);

    const afterEdit = result.current.threads;
    act(() =>
      push(
        mailboxSnapshot([
          conversation("c-1"),
          { ...conversation("c-2"), starred: true },
        ]),
      ),
    );

    expect(result.current.threads).toBe(afterEdit);
  });
});

function conversation(
  conversationId: string,
): MailboxView["conversations"][number] {
  return {
    key: { accountId: "acc-1", conversationId },
    subject: `Subject ${conversationId}`,
    preview: "Preview",
    from: "ada@example.com",
    to: "me@example.com",
    senders: ["ada@example.com"],
    latestMessageAtMs: 1,
    unread: false,
    starred: false,
    labelIds: [],
    roles: ["inbox"],
    pendingOperationIds: [],
  };
}

function staticMailboxHandle(snapshot: QuerySnapshot<MailboxView>) {
  return {
    getSnapshot: () => snapshot,
    subscribe: () => () => undefined,
    close: () => undefined,
  };
}

function mailboxSnapshot(
  conversations = [conversation("c-1")],
): QuerySnapshot<MailboxView> {
  return {
    status: "ready",
    revision: { databaseEpoch: "e1", sequence: 1 },
    refreshing: false,
    error: null,
    data: {
      conversations: conversations.map((item) => ({
        ...item,
        key: { ...item.key },
      })),
      counts: {
        matchingConversations: 2,
        unreadConversations: 0,
        extent: "local_coverage",
      },
      nextPage: "cursor-2",
      coverage: [],
      connection: "ready",
    },
  };
}
