import { describe, expect, it } from "vitest";
import { createHostRuntime, createMailEngine } from "./engine";
import type { MailStore } from "./ports/mail-store";
import type { MailboxSource } from "./ports/mailbox-source";
import type { OperationExecutor } from "./ports/operation-executor";
import type { ConversationQuery, QueryHandle } from "./queries";

describe("mail engine mailbox windows", () => {
  it("delegates window reads to the store snapshot and increments page count on load more", async () => {
    const query = inboxQuery();
    const requestedPageCounts: number[] = [];
    const engine = createMailEngine({
      store: mailboxWindowStore(requestedPageCounts),
      source: idleSource(),
      executor: idleExecutor(),
      runtime: createHostRuntime(),
    });
    const handle = engine.observeMailboxWindow?.(query);
    if (!handle) throw new Error("missing mailbox window handle");
    await waitForReady(handle);

    await handle.loadMore();

    expect(requestedPageCounts).toEqual([1, 2]);
    expect(handle.getSnapshot().revision).toEqual({
      databaseEpoch: "test",
      sequence: 2,
    });
    expect(handle.getSnapshot().data?.counts.matchingConversations).toBe(2);
    await engine.close();
  });

  it("can start a mailbox window at a requested page count", async () => {
    const requestedPageCounts: number[] = [];
    const engine = createMailEngine({
      store: mailboxWindowStore(requestedPageCounts),
      source: idleSource(),
      executor: idleExecutor(),
      runtime: createHostRuntime(),
    });
    const handle = engine.observeMailboxWindow?.(inboxQuery(), {
      pageCount: 3,
    });
    if (!handle) throw new Error("missing mailbox window handle");
    await waitForReady(handle);

    await handle.loadMore();

    expect(requestedPageCounts).toEqual([3, 4]);
    expect(handle.getSnapshot().data?.counts.matchingConversations).toBe(4);
    await engine.close();
  });
});

function inboxQuery(): ConversationQuery {
  return {
    accountIds: ["acc-1"],
    predicate: { kind: "role", role: "inbox" },
    order: "newest_first",
    pageSize: 1,
    after: null,
  };
}

function mailboxWindowStore(requestedPageCounts: number[]): MailStore {
  return {
    async readMailboxWindow(input: ConversationQuery, pageCount: number) {
      requestedPageCounts.push(pageCount);
      return {
        revision: { databaseEpoch: "test", sequence: pageCount },
        view: {
          conversations: [
            {
              key: {
                accountId: input.accountIds[0] ?? "acc-1",
                conversationId: `c${pageCount}`,
              },
              subject: `c${pageCount}`,
              preview: `c${pageCount}`,
              from: "ada@example.com",
              to: "me@example.com",
              senders: ["ada@example.com"],
              latestMessageAtMs: pageCount,
              unread: false,
              starred: false,
              labelIds: [],
              roles: ["inbox"],
              pendingOperationIds: [],
            },
          ],
          counts: {
            matchingConversations: pageCount,
            unreadConversations: 0,
            extent: "complete_scope",
          },
          nextPage: null,
          coverage: [],
          connection: "ready",
        },
      };
    },
    async enqueueSearch() {
      return { databaseEpoch: "test", sequence: 0 };
    },
    async close() {},
  } as unknown as MailStore;
}

async function waitForReady(handle: QueryHandle<unknown>) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (handle.getSnapshot().status === "ready") return;
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  throw new Error("mailbox window did not become ready");
}

function idleSource(): MailboxSource {
  return {
    async describe() {
      return {
        status: "ok",
        value: {
          strategy: "account_history",
          supportedChanges: ["archive"],
          maxPageSize: 50,
          maxHydrationBatch: 20,
        },
      };
    },
    async discoverScopes() {
      return { status: "ok", value: { scopes: [], nextPage: null } };
    },
    async beginBootstrap() {
      return { status: "paused", retryAfterMs: 0, reason: "unavailable" };
    },
    async enumerate() {
      return { status: "paused", retryAfterMs: 0, reason: "unavailable" };
    },
    async readChanges() {
      return { status: "paused", retryAfterMs: 0, reason: "unavailable" };
    },
    async hydrate() {
      return { status: "paused", retryAfterMs: 0, reason: "unavailable" };
    },
    async readConversationMembership() {
      return { status: "paused", retryAfterMs: 0, reason: "unavailable" };
    },
    async search() {
      return { status: "unsupported" };
    },
    async readAttachment() {
      return { status: "paused", retryAfterMs: 0, reason: "unavailable" };
    },
  };
}

function idleExecutor(): OperationExecutor {
  return {
    async execute() {
      return { status: "uncertain", receiptId: null };
    },
    async inspect() {
      return { status: "uncertain", receiptId: null };
    },
  };
}
