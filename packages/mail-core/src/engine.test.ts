import { describe, expect, it, vi } from "vitest";
import { createHostRuntime, createMailEngine } from "./engine";
import type { AccountSyncState, MailStore } from "./ports/mail-store";
import type { MailboxSource, ScopeDescriptor } from "./ports/mailbox-source";
import type { AssistantStateSource } from "./ports/assistant-source";
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
      databaseEpoch: "test:pages:2",
      sequence: 1,
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

  it("caps mailbox window page count", async () => {
    const requestedPageCounts: number[] = [];
    const engine = createMailEngine({
      store: mailboxWindowStore(requestedPageCounts),
      source: idleSource(),
      executor: idleExecutor(),
      runtime: createHostRuntime(),
    });
    const handle = engine.observeMailboxWindow?.(inboxQuery(), {
      pageCount: 99,
    });
    if (!handle) throw new Error("missing mailbox window handle");
    await waitForReady(handle);
    expect(requestedPageCounts).toEqual([40]);
    await engine.close();
  });
});

describe("mail engine idle catch-up scheduling", () => {
  it("checks every stream once, then waits for the idle interval", async () => {
    const harness = idleCatchUpHarness({ streamIds: ["inbox", "archive"] });
    await harness.engine.runUntil(10_000);

    await harness.engine.runUntil(10_000);

    expect(harness.discoveredScopeRequests).toBe(1);
    expect(harness.readChangeStreams).toEqual(["inbox", "archive"]);

    harness.advance(60_000);
    await harness.engine.runUntil(70_000);

    expect(harness.discoveredScopeRequests).toBe(2);
    expect(harness.readChangeStreams).toEqual([
      "inbox",
      "archive",
      "inbox",
      "archive",
    ]);
    await harness.engine.close();
  });

  it("lets host work run between streams in one idle catch-up", async () => {
    const harness = idleCatchUpHarness({ streamIds: ["inbox", "archive"] });
    harness.onReadChanges = (streamId) => {
      if (streamId !== "inbox") return;
      setTimeout(() => harness.readChangeStreams.push("host"), 0);
    };
    await harness.engine.runUntil(10_000);

    expect(harness.readChangeStreams).toEqual(["inbox", "host", "archive"]);
    await harness.engine.close();
  });

  it("does not claim work once the deadline passes while yielding", async () => {
    const harness = idleCatchUpHarness({ streamIds: ["inbox"] });
    const claimWork = vi.spyOn(harness.store, "claimWork");
    setTimeout(() => harness.advance(10_000), 0);
    await harness.engine.runUntil(5000);

    expect(claimWork).not.toHaveBeenCalled();
    expect(harness.readChangeStreams).toEqual([]);
    await harness.engine.close();
  });

  it("explicit sync bypasses the idle catch-up gate", async () => {
    const harness = idleCatchUpHarness({ streamIds: ["inbox"] });
    await harness.engine.runUntil(10_000);
    harness.advance(1000);
    await harness.engine.runUntil(11_000);

    await harness.engine.requestSync(["acc-1"]);
    await harness.engine.runUntil(11_000);

    expect(harness.discoveredScopeRequests).toBe(2);
    expect(harness.readChangeStreams).toEqual(["inbox", "inbox"]);
    await harness.engine.close();
  });

  it("gates idle assistant catch-up and lets explicit sync wake it", async () => {
    const assistantCursors: Array<string | null> = [];
    const harness = idleCatchUpHarness({
      streamIds: ["inbox"],
      assistant: assistantSource(assistantCursors),
    });
    await harness.engine.runUntil(10_000);
    harness.advance(1000);
    await harness.engine.runUntil(11_000);

    await harness.engine.requestSync(["acc-1"]);
    await harness.engine.runUntil(11_000);

    expect(assistantCursors).toEqual([null, null]);
    await harness.engine.close();
  });

  it("continues assistant pages without waiting for the idle interval", async () => {
    const assistantCursors: Array<string | null> = [];
    const harness = idleCatchUpHarness({
      streamIds: ["inbox"],
      assistant: pagedAssistantSource(assistantCursors),
    });
    await harness.engine.runUntil(10_000);
    harness.advance(1000);
    await harness.engine.runUntil(11_000);
    harness.advance(1000);
    await harness.engine.runUntil(12_000);

    expect(assistantCursors).toEqual([null, "cursor-1", "cursor-2"]);
    await harness.engine.close();
  });

  it("continues partial sync pages without waiting for the idle interval", async () => {
    const harness = idleCatchUpHarness({
      streamIds: ["inbox"],
      partialPagesBeforeComplete: 1,
    });
    await harness.engine.runUntil(10_000);
    harness.advance(1000);
    await harness.engine.runUntil(11_000);
    harness.advance(1000);
    await harness.engine.runUntil(12_000);

    expect(harness.readChangeStreams).toEqual(["inbox", "inbox"]);
    await harness.engine.close();
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
        revision: { databaseEpoch: "test", sequence: 1 },
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

function idleCatchUpHarness(input: {
  streamIds: string[];
  partialPagesBeforeComplete?: number;
  assistant?: AssistantStateSource;
}) {
  let nowMs = 0;
  let nextId = 0;
  const readChangeStreams: string[] = [];
  const streams: Array<AccountSyncState["streams"][number]> =
    input.streamIds.map((streamId) => ({
      accountId: "acc-1",
      streamId,
      generation: "g1",
      checkpoint: "start",
    }));
  let discoveredScopeRequests = 0;
  let partialPagesRemaining = input.partialPagesBeforeComplete ?? 0;
  const source: MailboxSource = {
    ...idleSource(),
    async discoverScopes() {
      discoveredScopeRequests += 1;
      return {
        status: "ok",
        value: {
          scopes: input.streamIds.map((streamId) => ({
            id: streamId,
            kind: "folder" as const,
            folderId: streamId,
          })) satisfies ScopeDescriptor[],
          nextPage: null,
        },
      };
    },
    async readChanges({ session, requestId, position }) {
      readChangeStreams.push(position.streamId);
      harness.onReadChanges(position.streamId);
      const roundComplete = partialPagesRemaining === 0;
      if (partialPagesRemaining > 0) partialPagesRemaining -= 1;
      return {
        status: "page",
        page: {
          session,
          requestId,
          from: position,
          to: {
            ...position,
            checkpoint: `${position.streamId}-${readChangeStreams.length}`,
          },
          changes: [],
          requiredHydration: [],
          bodies: [],
          roundComplete,
        },
      };
    },
  };
  const store = idleCatchUpStore(streams);
  const engine = createMailEngine({
    store,
    source,
    executor: idleExecutor(),
    assistant: input.assistant,
    runtime: createHostRuntime({
      nowMs: () => nowMs,
      randomId: () => {
        nextId += 1;
        return `id-${nextId}`;
      },
    }),
  });
  const harness = {
    engine,
    store,
    readChangeStreams,
    onReadChanges: (_streamId: string) => {},
    get discoveredScopeRequests() {
      return discoveredScopeRequests;
    },
    advance(ms: number) {
      nowMs += ms;
    },
  };
  return harness;
}

function idleCatchUpStore(
  streams: Array<AccountSyncState["streams"][number]>,
): MailStore {
  let assistantCursor: string | null = null;
  return {
    async claimWork() {
      return null;
    },
    async readAccountSyncStates() {
      return [
        {
          accountId: "acc-1",
          generation: "g1",
          assistantCursor,
          streams,
          stream:
            streams.find((stream) => stream.streamId === "primary") ?? null,
        },
      ];
    },
    async registerSyncScopes() {
      return false;
    },
    async applyAssistantEntries(
      input: Parameters<MailStore["applyAssistantEntries"]>[0],
    ) {
      assistantCursor = input.cursor ?? null;
      return { databaseEpoch: "test", sequence: streams.length };
    },
    async applySyncPage(input: Parameters<MailStore["applySyncPage"]>[0]) {
      const stream = streams.find(
        (item) => item.streamId === input.page.to.streamId,
      );
      if (stream) stream.checkpoint = input.page.to.checkpoint;
      return {
        status: "committed",
        revision: { databaseEpoch: "test", sequence: streams.length },
      };
    },
    async recordConnection() {
      return false;
    },
    async releaseDeferredOperations() {},
    async close() {},
  } as unknown as MailStore;
}

function assistantSource(cursors: Array<string | null>): AssistantStateSource {
  return {
    async read({ session, cursor }) {
      const currentCursor = cursor ?? null;
      cursors.push(currentCursor);
      return {
        status: "ok",
        page: {
          session,
          cursor: currentCursor,
          entries: [],
          nextCursor: currentCursor,
          reset: false,
        },
      };
    },
  };
}

function pagedAssistantSource(
  cursors: Array<string | null>,
): AssistantStateSource {
  return {
    async read({ session, cursor }) {
      const currentCursor = cursor ?? null;
      cursors.push(currentCursor);
      const nextCursor =
        currentCursor === null
          ? "cursor-1"
          : currentCursor === "cursor-1"
            ? "cursor-2"
            : currentCursor;
      return {
        status: "ok",
        page: {
          session,
          cursor: currentCursor,
          entries: [],
          nextCursor,
          reset: false,
        },
      };
    },
  };
}
