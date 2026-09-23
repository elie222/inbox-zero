import { describe, expect, it, vi } from "vitest";
import { createMailIpcClient } from "./mail-ipc-client";

describe("createMailIpcClient", () => {
  it("wraps an ok IPC result and rejects a failed method", async () => {
    const invoke = vi.fn(async (payload: unknown) => {
      const request = payload as { method: string; requestId: string };
      if (
        request.method === "getDiagnostics" ||
        request.method === "purgeAccount"
      ) {
        return { status: "ok", result: { accountId: "acc-1" } };
      }
      return { status: "invalid" };
    });
    const client = createMailIpcClient(invoke, {
      requestId: () => "req-1",
      pollMs: 60_000,
    });

    await expect(client.getDiagnostics("acc-1")).resolves.toEqual({
      accountId: "acc-1",
    });
    expect(invoke).toHaveBeenCalledWith({
      protocolVersion: 1,
      requestId: "req-1",
      method: "getDiagnostics",
      payload: { accountId: "acc-1" },
    });
    await expect(client.purgeAccount("acc-1")).resolves.toEqual({
      accountId: "acc-1",
    });
    expect(invoke).toHaveBeenCalledWith({
      protocolVersion: 1,
      requestId: "req-1",
      method: "purgeAccount",
      payload: { accountId: "acc-1" },
    });
    await expect(client.submitMetadata({} as never)).rejects.toThrow(
      "Mail engine submitMetadata failed",
    );
  });

  it("includes the mailbox provider on requestSync", async () => {
    const invoke = vi.fn(async () => ({
      status: "ok",
      result: { status: "scheduled" },
    }));
    const client = createMailIpcClient(invoke, {
      requestId: () => "sync-1",
      provider: "microsoft",
    });
    await expect(client.requestSync(["acc-1"])).resolves.toEqual({
      status: "scheduled",
    });
    expect(invoke).toHaveBeenCalledWith({
      protocolVersion: 1,
      requestId: "sync-1",
      method: "requestSync",
      payload: { accountIds: ["acc-1"], provider: "microsoft" },
    });
  });

  it("polls observeMailbox until close", async () => {
    const invoke = vi.fn(async () => ({
      status: "ok",
      result: {
        status: "ready",
        revision: { databaseEpoch: "e1", sequence: 1 },
        data: { conversations: [] },
        refreshing: false,
        error: null,
      },
    }));
    const client = createMailIpcClient(invoke, {
      requestId: () => "obs-1",
      pollMs: 20,
    });
    const handle = client.observeMailbox({
      accountIds: ["acc-1"],
      predicate: { kind: "role", role: "inbox" },
      order: "newest_first",
      pageSize: 25,
      after: null,
    });
    await vi.waitFor(() => {
      expect(handle.getSnapshot().status).toBe("ready");
    });
    handle.close();
    const calls = invoke.mock.calls.length;
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(invoke.mock.calls.length).toBe(calls);
  });

  it("does not notify listeners when a poll returns the same revision", async () => {
    const invoke = vi.fn(async () => ({
      status: "ok",
      result: snapshotWithConversations(1),
    }));
    const client = createMailIpcClient(invoke, {
      requestId: () => crypto.randomUUID(),
      pollMs: 5,
    });
    const handle = client.observeMailbox({
      accountIds: ["acc-1"],
      predicate: { kind: "role", role: "inbox" },
      order: "newest_first",
      pageSize: 25,
      after: null,
    });
    await vi.waitFor(() => {
      expect(handle.getSnapshot().status).toBe("ready");
    });
    const listener = vi.fn();
    handle.subscribe(listener);
    const calls = invoke.mock.calls.length;
    await vi.waitFor(() => {
      expect(invoke.mock.calls.length).toBeGreaterThan(calls + 2);
    });
    expect(listener).not.toHaveBeenCalled();
    handle.close();
    await client.close?.();
  });

  it("stops mailbox polls when the client closes", async () => {
    const invoke = vi.fn(async () => ({
      status: "ok",
      result: {
        status: "ready",
        revision: { databaseEpoch: "e1", sequence: 1 },
        data: { conversations: [] },
        refreshing: false,
        error: null,
      },
    }));
    const client = createMailIpcClient(invoke, {
      requestId: () => "obs-close",
      pollMs: 20,
    });
    client.observeMailbox({
      accountIds: ["acc-1"],
      predicate: { kind: "role", role: "inbox" },
      order: "newest_first",
      pageSize: 25,
      after: null,
    });
    await vi.waitFor(() => {
      expect(invoke).toHaveBeenCalled();
    });
    await client.close?.();
    const calls = invoke.mock.calls.length;
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(invoke.mock.calls.length).toBe(calls);
  });

  it("does not overlap slow mailbox polls", async () => {
    const pending: Array<(value: unknown) => void> = [];
    const invoke = vi.fn(
      () =>
        new Promise((resolve) => {
          pending.push(resolve);
        }),
    );
    const client = createMailIpcClient(invoke, {
      requestId: () => crypto.randomUUID(),
      pollMs: 5,
    });
    const handle = client.observeMailbox({
      accountIds: ["acc-1"],
      predicate: { kind: "role", role: "inbox" },
      order: "newest_first",
      pageSize: 25,
      after: null,
    });

    await vi.waitFor(() => expect(pending).toHaveLength(1));
    await new Promise((resolve) => setTimeout(resolve, 25));
    expect(pending).toHaveLength(1);

    pending[0]?.({ status: "ok", result: snapshotWithConversations(1) });
    await vi.waitFor(() => {
      expect(handle.getSnapshot().status).toBe("ready");
    });
    expect(handle.getSnapshot().data?.conversations).toHaveLength(1);
    handle.close();
    await client.close?.();
  });

  it("subscribes to pushed snapshots instead of polling", async () => {
    const push = createPushHost();
    const invoke = vi.fn();
    const client = createMailIpcClient(invoke, {
      requestId: () => crypto.randomUUID(),
      pollMs: 5,
      push: push.transport,
    });
    const handle = client.observeMailbox({
      accountIds: ["acc-1"],
      predicate: { kind: "role", role: "inbox" },
      order: "newest_first",
      pageSize: 25,
      after: null,
    });
    await vi.waitFor(() => expect(push.subscriptions.size).toBe(1));
    const [subscriptionId, request] =
      [...push.subscriptions.entries()][0] ?? [];
    expect(request).toMatchObject({ method: "observeMailbox" });

    push.send("someone-else", snapshotWithConversations(3));
    push.send(String(subscriptionId), snapshotWithConversations(1));
    await vi.waitFor(() => {
      expect(handle.getSnapshot().data?.conversations).toHaveLength(1);
    });
    await new Promise((resolve) => setTimeout(resolve, 25));
    expect(invoke).not.toHaveBeenCalled();

    handle.close();
    expect(push.subscriptions.size).toBe(0);
    await client.close?.();
  });

  it("replaces the pushed subscription when a mailbox window loads more", async () => {
    const push = createPushHost();
    const client = createMailIpcClient(vi.fn(), {
      requestId: () => crypto.randomUUID(),
      push: push.transport,
    });
    const handle = client.observeMailboxWindow?.({
      accountIds: ["acc-1"],
      predicate: { kind: "role", role: "inbox" },
      order: "newest_first",
      pageSize: 25,
      after: null,
    });
    if (!handle) throw new Error("missing mailbox window handle");
    await vi.waitFor(() => expect(push.subscriptions.size).toBe(1));
    const first = [...push.subscriptions.keys()][0] ?? "";
    push.send(first, snapshotWithConversations(1));

    const loadMore = handle.loadMore();
    await vi.waitFor(() => {
      expect([...push.subscriptions.keys()]).not.toContain(first);
      expect(push.subscriptions.size).toBe(1);
    });
    const [second, request] = [...push.subscriptions.entries()][0] ?? [];
    expect(request).toMatchObject({ payload: { pageCount: 2 } });
    push.send(String(second), snapshotWithConversations(2));
    await loadMore;
    expect(handle.getSnapshot().data?.conversations).toHaveLength(2);
    handle.close();
  });

  it("serializes loadMore behind an active mailbox window refresh", async () => {
    const pending: Array<{
      payload: { method: string; payload: { pageCount?: number } };
      resolve: (value: unknown) => void;
    }> = [];
    const invoke = vi.fn(
      (payload: unknown) =>
        new Promise((resolve) => {
          pending.push({
            payload: payload as {
              method: string;
              payload: { pageCount?: number };
            },
            resolve,
          });
        }),
    );
    const client = createMailIpcClient(invoke, {
      requestId: () => crypto.randomUUID(),
      pollMs: 60_000,
    });
    const handle = client.observeMailboxWindow?.({
      accountIds: ["acc-1"],
      predicate: { kind: "role", role: "inbox" },
      order: "newest_first",
      pageSize: 25,
      after: null,
    });
    if (!handle) throw new Error("missing mailbox window handle");

    await vi.waitFor(() => expect(pending).toHaveLength(1));
    const loadMore = handle.loadMore();
    await new Promise((resolve) => setTimeout(resolve, 25));
    expect(pending).toHaveLength(1);

    pending[0]?.resolve({ status: "ok", result: snapshotWithConversations(1) });
    await vi.waitFor(() => expect(pending).toHaveLength(2));
    expect(pending[0]?.payload.payload.pageCount).toBe(1);
    expect(pending[1]?.payload.payload.pageCount).toBe(2);

    pending[1]?.resolve({ status: "ok", result: snapshotWithConversations(2) });
    await loadMore;
    expect(handle.getSnapshot().data?.conversations).toHaveLength(2);
    handle.close();
  });
});

function snapshotWithConversations(count: number) {
  return {
    status: "ready" as const,
    revision: { databaseEpoch: "e1", sequence: count },
    data: {
      conversations: Array.from({ length: count }, (_, index) => ({
        key: { accountId: "acc-1", conversationId: `c-${index + 1}` },
      })),
      counts: {
        matchingConversations: count,
        unreadConversations: 0,
        extent: "complete_scope" as const,
      },
      nextPage: count === 1 ? "cursor-2" : null,
      coverage: [],
    },
    refreshing: false,
    error: null,
  };
}

function createPushHost() {
  const subscriptions = new Map<string, unknown>();
  let listener:
    | ((event: { subscriptionId: string; snapshot: unknown }) => void)
    | null = null;
  return {
    subscriptions,
    send(subscriptionId: string, snapshot: unknown) {
      listener?.({ subscriptionId, snapshot });
    },
    transport: {
      async subscribe(input: { subscriptionId: string; request: unknown }) {
        subscriptions.set(input.subscriptionId, input.request);
        return { status: "ok" };
      },
      async unsubscribe(subscriptionId: string) {
        subscriptions.delete(subscriptionId);
        return { status: "ok" };
      },
      onSnapshot(
        next: (event: { subscriptionId: string; snapshot: unknown }) => void,
      ) {
        listener = next;
        return () => {
          listener = null;
        };
      },
    },
  };
}
