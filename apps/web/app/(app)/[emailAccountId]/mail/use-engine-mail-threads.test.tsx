/** @vitest-environment jsdom */

import { setupI18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { messages as en } from "@/locales/en/messages.po";
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
  return (
    <TestMailEngineProvider client={null}>{children}</TestMailEngineProvider>
  );
}

describe("useEngineMailThreads", () => {
  it.each([
    "loading",
    "ready",
    "error",
  ] as const)("reflects provider search status %s after the local read is ready", async (searchStatus) => {
    const snapshot = mailboxSnapshot([]);
    if (!snapshot.data) throw new Error("missing mailbox data");
    snapshot.data.searchStatus = searchStatus;
    const client = {
      observeMailbox: () => staticMailboxHandle(snapshot),
      requestSync: async () => ({ status: "scheduled" }),
    } as unknown as MailClient;
    const { result } = renderHook(
      () =>
        useEngineMailThreads({
          emailAccountId: "acc-1",
          query: { q: "invoice" },
        }),
      {
        wrapper: ({ children }) => (
          <TestMailEngineProvider client={client}>
            {children}
          </TestMailEngineProvider>
        ),
      },
    );
    await waitFor(() => {
      expect(result.current.isLoading).toBe(searchStatus === "loading");
      expect(Boolean(result.current.error)).toBe(searchStatus === "error");
    });
  });

  it("reopens a failed search when refetched", async () => {
    const failed = mailboxSnapshot([]);
    if (!failed.data) throw new Error("missing mailbox data");
    failed.data.searchStatus = "error";
    const first = { ...staticMailboxHandle(failed), close: vi.fn() };
    const observeMailbox = vi
      .fn()
      .mockReturnValueOnce(first)
      .mockReturnValue(staticMailboxHandle(mailboxSnapshot([])));
    const client = {
      observeMailbox,
      requestSync: vi.fn(async () => ({ status: "scheduled" })),
    } as unknown as MailClient;
    const { result } = renderHook(
      () =>
        useEngineMailThreads({
          emailAccountId: "acc-1",
          query: { q: "invoice" },
        }),
      {
        wrapper: ({ children }) => (
          <TestMailEngineProvider client={client}>
            {children}
          </TestMailEngineProvider>
        ),
      },
    );
    await waitFor(() =>
      expect(result.current.error?.error).toBe(
        "Couldn't complete this search.",
      ),
    );
    await act(() => result.current.refetch());
    await waitFor(() => expect(result.current.error).toBeUndefined());
    expect(first.close).toHaveBeenCalledOnce();
    expect(observeMailbox).toHaveBeenCalledTimes(2);
  });

  it("retains loaded rows if a refetch fails before returning any data", async () => {
    const retained = mailboxSnapshot();
    retained.status = "error";
    retained.error = { code: "unavailable", retryable: true };
    const unavailable: QuerySnapshot<MailboxView> = {
      status: "error",
      revision: null,
      refreshing: false,
      data: null,
      error: { code: "unavailable", retryable: true },
    };
    const observeMailbox = vi
      .fn()
      .mockReturnValueOnce(staticMailboxHandle(retained))
      .mockReturnValue(staticMailboxHandle(unavailable));
    const client = {
      observeMailbox,
      requestSync: async () => ({ status: "scheduled" }),
    } as unknown as MailClient;
    const { result } = renderHook(
      () =>
        useEngineMailThreads({
          emailAccountId: "acc-1",
          query: { q: "invoice" },
        }),
      {
        wrapper: ({ children }) => (
          <TestMailEngineProvider client={client}>
            {children}
          </TestMailEngineProvider>
        ),
      },
    );
    await waitFor(() => expect(result.current.threads).toHaveLength(1));
    await act(() => result.current.refetch());
    await waitFor(() =>
      expect(result.current.error?.error).toBe("Couldn't load this mailbox."),
    );
    expect(result.current.threads).toHaveLength(1);
  });

  it("keeps mailbox-read wording when the local read also failed", async () => {
    const snapshot = mailboxSnapshot([]);
    snapshot.status = "error";
    snapshot.error = { code: "unavailable", retryable: true };
    if (!snapshot.data) throw new Error("missing mailbox data");
    snapshot.data.searchStatus = "error";
    const client = {
      observeMailbox: () => staticMailboxHandle(snapshot),
      requestSync: async () => ({ status: "scheduled" }),
    } as unknown as MailClient;
    const { result } = renderHook(
      () =>
        useEngineMailThreads({
          emailAccountId: "acc-1",
          query: { q: "invoice" },
        }),
      {
        wrapper: ({ children }) => (
          <TestMailEngineProvider client={client}>
            {children}
          </TestMailEngineProvider>
        ),
      },
    );
    await waitFor(() =>
      expect(result.current.error?.error).toBe("Couldn't load this mailbox."),
    );
  });

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
      listDrafts: vi.fn(),
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
      <TestMailEngineProvider client={client}>
        {children}
      </TestMailEngineProvider>
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
      listDrafts: vi.fn(),
      submitSend: vi.fn(),
      cancelOperation: vi.fn(),
      requestSync: vi.fn(async () => ({ status: "scheduled" as const })),
      ensureMessageContent: vi.fn(),
      getDiagnostics: vi.fn(),
      purgeAccount: vi.fn(),
    } as unknown as MailClient;
    const clientWrapper = ({ children }: { children: ReactNode }) => (
      <TestMailEngineProvider client={client}>
        {children}
      </TestMailEngineProvider>
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
      <TestMailEngineProvider client={client}>
        {children}
      </TestMailEngineProvider>
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

  it("reports an empty view as syncing until the first full sync completes", async () => {
    const emptyView = (metadata: "partial" | "complete") => {
      const snapshot = mailboxSnapshot([]);
      if (!snapshot.data) throw new Error("expected mailbox data");
      snapshot.data.coverage = [
        {
          accountId: "acc-1",
          scopeId: "primary",
          metadata,
          content: "partial",
          indexedContent: "partial",
          lastCompletedSyncAtMs: metadata === "complete" ? 1 : null,
        },
      ];
      return snapshot;
    };
    let snapshot = emptyView("partial");
    const listeners = new Set<() => void>();
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
      <TestMailEngineProvider client={client}>
        {children}
      </TestMailEngineProvider>
    );

    const { result } = renderHook(
      () =>
        useEngineMailThreads({
          emailAccountId: "acc-1",
          query: { type: "inbox" } as ThreadsQuery,
        }),
      { wrapper: clientWrapper },
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.isSyncing).toBe(true);

    act(() => {
      snapshot = emptyView("complete");
      for (const listener of listeners) listener();
    });

    expect(result.current.isSyncing).toBe(false);
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
    hasAttachments: false,
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

const testI18n = setupI18n({ locale: "en", messages: { en } });

function TestMailEngineProvider({
  client,
  children,
}: {
  client: MailClient | null;
  children: ReactNode;
}) {
  return (
    <I18nProvider i18n={testI18n}>
      <MailEngineProvider client={client}>{children}</MailEngineProvider>
    </I18nProvider>
  );
}
