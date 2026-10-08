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

    expect(harness.discoveredScopeRequests).toBe(1);
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

    expect(harness.discoveredScopeRequests).toBe(1);
    expect(harness.readChangeStreams).toEqual(["inbox", "inbox"]);
    await harness.engine.close();
  });

  it("checks low-priority streams and rediscovers scopes on a slower clock", async () => {
    const harness = idleCatchUpHarness({
      streamIds: ["inbox", "projects"],
      lowPriority: ["projects"],
    });
    await harness.engine.runUntil(10_000);

    for (let minute = 1; minute < 10; minute++) {
      harness.advance(60_000);
      await harness.engine.runUntil(harness.nowMs + 1000);
    }

    expect(countOf(harness.readChangeStreams, "inbox")).toBe(10);
    expect(countOf(harness.readChangeStreams, "projects")).toBe(1);
    expect(harness.discoveredScopeRequests).toBe(1);

    harness.advance(60_000);
    await harness.engine.runUntil(harness.nowMs + 1000);

    expect(countOf(harness.readChangeStreams, "projects")).toBe(2);
    expect(harness.discoveredScopeRequests).toBe(2);
    await harness.engine.close();
  });

  it("a sync request refreshes low-priority streams only after a short minimum", async () => {
    const harness = idleCatchUpHarness({
      streamIds: ["inbox", "projects"],
      lowPriority: ["projects"],
    });
    await harness.engine.runUntil(10_000);

    harness.advance(30_000);
    await harness.engine.requestSync(["acc-1"]);
    await harness.engine.runUntil(harness.nowMs + 1000);

    expect(harness.readChangeStreams).toEqual(["inbox", "projects", "inbox"]);

    harness.advance(120_000);
    await harness.engine.runUntil(harness.nowMs + 1000);

    expect(countOf(harness.readChangeStreams, "projects")).toBe(2);
    expect(harness.discoveredScopeRequests).toBe(2);
    await harness.engine.close();
  });

  it("keeps syncing later accounts while an earlier account's streams are slow", async () => {
    const harness = multiAccountHarness({
      accounts: [
        { accountId: "acc-a", streamIds: folderIds(20), readMs: 4000 },
        { accountId: "acc-b", streamIds: ["primary"], readMs: 500 },
      ],
    });

    await harness.runFor(10 * 60_000);

    expect(harness.readsFor("acc-b")).toBeGreaterThanOrEqual(5);
    await harness.engine.close();
  });

  it("syncs other accounts while one account's request hangs", async () => {
    const harness = multiAccountHarness({
      accounts: [
        { accountId: "acc-a", streamIds: ["inbox"], readMs: 0, hangs: true },
        { accountId: "acc-b", streamIds: ["primary"], readMs: 0 },
      ],
    });

    await harness.engine.runUntil(50);
    harness.advance(61_000);
    await harness.engine.runUntil(harness.nowMs + 50);

    expect(harness.reads).toEqual([
      "acc-a:inbox",
      "acc-b:primary",
      "acc-b:primary",
    ]);
    harness.releaseHangs();
    await harness.engine.close();
  });

  it("runs commands while an account's sync request hangs", async () => {
    const executed: string[] = [];
    const harness = multiAccountHarness({
      accounts: [
        { accountId: "acc-a", streamIds: ["inbox"], readMs: 0, hangs: true },
      ],
      onExecute: (operationId) => executed.push(operationId),
    });
    await harness.engine.runUntil(50);
    harness.queueCommand("op-1");

    await harness.engine.runUntil(50);

    expect(harness.reads).toEqual(["acc-a:inbox"]);
    expect(executed).toEqual(["op-1"]);
    harness.releaseHangs();
    await harness.engine.close();
  });

  it("abandons a hung lane, reports it, and retries after a backoff", async () => {
    const harness = multiAccountHarness({
      accounts: [
        { accountId: "acc-a", streamIds: ["inbox"], readMs: 0, hangs: true },
      ],
      syncLaneTimeoutMs: 20,
    });
    await expect(harness.engine.runUntil(50)).rejects.toThrow("timed out");

    await harness.engine.requestSync(["acc-a"]);
    await harness.engine.runUntil(50);
    expect(harness.reads).toEqual(["acc-a:inbox"]);

    harness.advance(1000);
    await harness.engine.runUntil(harness.nowMs + 10).catch(() => {});

    expect(harness.reads).toEqual(["acc-a:inbox", "acc-a:inbox"]);
    harness.releaseHangs();
    await harness.engine.close();
  });

  it("stops a purged account's lane so a re-added account syncs right away", async () => {
    const harness = multiAccountHarness({
      accounts: [
        { accountId: "acc-a", streamIds: ["inbox"], readMs: 0, hangs: true },
      ],
    });
    await harness.engine.runUntil(50);

    await harness.engine.purgeAccount("acc-a");
    await harness.engine.runUntil(50);

    expect(harness.reads).toEqual(["acc-a:inbox", "acc-a:inbox"]);
    harness.releaseHangs();
    await harness.engine.close();
  });

  it("reports a failing lane and backs off that account", async () => {
    const harness = multiAccountHarness({
      accounts: [
        { accountId: "acc-a", streamIds: ["inbox"], readMs: 0, fails: true },
        { accountId: "acc-b", streamIds: ["primary"], readMs: 0 },
      ],
    });
    await expect(harness.engine.runUntil(50)).rejects.toThrow("read failed");

    await harness.engine.requestSync(["acc-a", "acc-b"]);
    await harness.engine.runUntil(50);

    expect(harness.reads).toEqual([
      "acc-a:inbox",
      "acc-b:primary",
      "acc-b:primary",
    ]);
    await harness.engine.close();
  });

  it("keeps the low-priority minimum across a burst of sync requests", async () => {
    const harness = idleCatchUpHarness({
      streamIds: ["inbox", "projects"],
      lowPriority: ["projects"],
    });
    await harness.engine.runUntil(10_000);

    for (let request = 0; request < 3; request++) {
      harness.advance(30_000);
      await harness.engine.requestSync(["acc-1"]);
      await harness.engine.runUntil(harness.nowMs + 1000);
    }

    expect(countOf(harness.readChangeStreams, "inbox")).toBe(4);
    expect(countOf(harness.readChangeStreams, "projects")).toBe(1);
    expect(harness.discoveredScopeRequests).toBe(1);

    harness.advance(30_000);
    await harness.engine.runUntil(harness.nowMs + 1000);

    expect(countOf(harness.readChangeStreams, "projects")).toBe(2);
    expect(harness.discoveredScopeRequests).toBe(2);
    await harness.engine.close();
  });

  it("keeps a sync request that arrives while a stream is being read", async () => {
    const harness = idleCatchUpHarness({ streamIds: ["inbox"] });
    let requested = false;
    harness.onReadChanges = () => {
      if (requested) return;
      requested = true;
      harness.engine.requestSync(["acc-1"]).catch(() => {});
    };
    await harness.engine.runUntil(10_000);

    harness.advance(1000);
    await harness.engine.runUntil(harness.nowMs + 1000);

    expect(harness.readChangeStreams).toEqual(["inbox", "inbox"]);
    await harness.engine.close();
  });

  it("retries a failed scope discovery on the normal clock", async () => {
    const harness = idleCatchUpHarness({ streamIds: ["inbox"] });
    let failDiscovery = true;
    const discoverScopes = harness.source.discoverScopes;
    harness.source.discoverScopes = async (request) => {
      if (failDiscovery) {
        failDiscovery = false;
        return { status: "paused", retryAfterMs: 1000, reason: "unavailable" };
      }
      return discoverScopes(request);
    };
    await harness.engine.runUntil(10_000);

    harness.advance(60_000);
    await harness.engine.runUntil(harness.nowMs + 1000);

    expect(harness.discoveredScopeRequests).toBe(1);
    await harness.engine.close();
  });

  it("reads every due stream of an account in one batch", async () => {
    const harness = idleCatchUpHarness({
      streamIds: ["inbox", "archive", "sent"],
      batch: true,
    });
    await harness.engine.runUntil(10_000);

    expect(harness.batchReads).toEqual([["inbox", "archive", "sent"]]);
    expect(harness.store.streamCheckpoints()).toEqual([
      "inbox-1",
      "archive-2",
      "sent-3",
    ]);

    await harness.engine.requestSync(["acc-1"]);
    harness.advance(1000);
    await harness.engine.runUntil(harness.nowMs + 1000);

    expect(harness.batchReads).toHaveLength(2);
    expect(harness.store.streamCheckpoints()).toEqual([
      "inbox-4",
      "archive-5",
      "sent-6",
    ]);
    await harness.engine.close();
  });

  it("reads a single due stream without a batch", async () => {
    const harness = idleCatchUpHarness({ streamIds: ["inbox"], batch: true });
    await harness.engine.runUntil(10_000);

    expect(harness.batchReads).toEqual([]);
    expect(harness.readChangeStreams).toEqual(["inbox"]);
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

  it("indexes the search backlog while idle and claims work between batches", async () => {
    const harness = idleCatchUpHarness({ streamIds: ["inbox"] });
    const events: string[] = [];
    let batches = 3;
    vi.spyOn(harness.store, "claimWork").mockImplementation(async () => {
      events.push("claim");
      return null;
    });
    vi.spyOn(harness.store, "indexSearchBacklog").mockImplementation(
      async () => {
        batches -= 1;
        events.push("batch");
        return { remaining: batches > 0 };
      },
    );
    await harness.engine.runUntil(10_000);

    expect(events).toEqual([
      "claim",
      "batch",
      "claim",
      "batch",
      "claim",
      "batch",
    ]);
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
  lowPriority?: string[];
  batch?: boolean;
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
  const batchReads: string[][] = [];
  let pagesRead = 0;
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
            priority: input.lowPriority?.includes(streamId)
              ? ("low" as const)
              : ("high" as const),
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
            checkpoint: `${position.streamId}-${++pagesRead}`,
          },
          changes: [],
          requiredHydration: [],
          bodies: [],
          roundComplete,
        },
      };
    },
  };
  if (input.batch) {
    source.readChangesBatch = async ({ session, reads, pageSize, signal }) => {
      batchReads.push(reads.map((read) => read.position.streamId));
      const results = [];
      for (const read of reads) {
        results.push(
          await source.readChanges({
            session,
            requestId: read.requestId,
            position: read.position,
            pageSize,
            signal,
          }),
        );
      }
      // Batched reads are tracked in batchReads, not as single reads.
      readChangeStreams.splice(-reads.length);
      return results;
    };
  }
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
    source,
    readChangeStreams,
    batchReads,
    onReadChanges: (_streamId: string) => {},
    get discoveredScopeRequests() {
      return discoveredScopeRequests;
    },
    get nowMs() {
      return nowMs;
    },
    advance(ms: number) {
      nowMs += ms;
    },
  };
  return harness;
}

function multiAccountHarness(input: {
  accounts: Array<{
    accountId: string;
    streamIds: string[];
    readMs: number;
    hangs?: boolean;
    fails?: boolean;
  }>;
  syncLaneTimeoutMs?: number;
  onExecute?: (operationId: string) => void;
}) {
  let nowMs = 0;
  let nextId = 0;
  const reads: string[] = [];
  const hangingReads: Array<() => void> = [];
  const accounts: AccountSyncState[] = input.accounts.map((account) => ({
    accountId: account.accountId,
    generation: "g1",
    assistantCursor: null,
    streams: account.streamIds.map((streamId) => ({
      accountId: account.accountId,
      streamId,
      generation: "g1",
      checkpoint: "start",
    })),
    stream: null,
  }));
  const accountFor = (accountId: string) => {
    const account = input.accounts.find((item) => item.accountId === accountId);
    if (!account) throw new Error(`Unknown account ${accountId}`);
    return account;
  };
  const source: MailboxSource = {
    ...idleSource(),
    async discoverScopes({ session }) {
      return {
        status: "ok",
        value: {
          scopes: accountFor(session.accountId).streamIds.map((streamId) => ({
            id: streamId,
            kind: "folder" as const,
            folderId: streamId,
          })),
          nextPage: null,
        },
      };
    },
    async readChanges({ session, requestId, position }) {
      reads.push(`${session.accountId}:${position.streamId}`);
      const account = accountFor(session.accountId);
      nowMs += account.readMs;
      if (account.hangs) {
        await new Promise<void>((resolve) => hangingReads.push(resolve));
      }
      if (account.fails) throw new Error("read failed");
      return {
        status: "page",
        page: {
          session,
          requestId,
          from: position,
          to: position,
          changes: [],
          requiredHydration: [],
          bodies: [],
          roundComplete: true,
        },
      };
    },
  };
  const queuedCommands: string[] = [];
  const store = {
    ...idleCatchUpStore([]),
    async readAccountSyncStates() {
      return accounts;
    },
    async claimWork() {
      const operationId = queuedCommands.shift();
      if (!operationId) return null;
      return {
        kind: "command",
        attemptId: `attempt-${operationId}`,
        operation: { key: { accountId: "acc-a", operationId } },
      };
    },
    async settleAttempt() {},
    async purgeAccount() {
      return { databaseEpoch: "test", sequence: 1 };
    },
  } as unknown as MailStore;
  const engine = createMailEngine({
    store,
    source,
    syncLaneTimeoutMs: input.syncLaneTimeoutMs,
    executor: {
      ...idleExecutor(),
      async execute({ operation }) {
        input.onExecute?.(operation.key.operationId);
        return { status: "uncertain", receiptId: null };
      },
    },
    runtime: createHostRuntime({
      nowMs: () => nowMs,
      randomId: () => {
        nextId += 1;
        return `id-${nextId}`;
      },
    }),
  });
  return {
    engine,
    store,
    reads,
    get nowMs() {
      return nowMs;
    },
    advance(ms: number) {
      nowMs += ms;
    },
    releaseHangs() {
      for (const release of hangingReads.splice(0)) release();
    },
    queueCommand(operationId: string) {
      queuedCommands.push(operationId);
    },
    readsFor(accountId: string) {
      return reads.filter((read) => read.startsWith(`${accountId}:`)).length;
    },
    // Mirrors the host loop: short runs with a pause between them.
    async runFor(durationMs: number) {
      const endMs = nowMs + durationMs;
      while (nowMs < endMs) {
        await engine.runUntil(nowMs + 2000);
        nowMs += 250;
      }
    },
  };
}

function countOf(values: string[], value: string) {
  return values.filter((item) => item === value).length;
}

function folderIds(count: number) {
  return Array.from({ length: count }, (_, index) => `folder-${index}`);
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
    async readBootstrapScan() {
      return null;
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
    async indexContactBacklog() {
      return { remaining: false };
    },
    async indexSearchBacklog() {
      return { remaining: false };
    },
    async close() {},
    streamCheckpoints() {
      return streams.map((stream) => stream.checkpoint);
    },
  } as unknown as MailStore & { streamCheckpoints(): Array<string | null> };
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
