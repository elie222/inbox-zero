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
      push: createPushHost().transport,
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
      push: createPushHost().transport,
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

  it("observes by subscribing to pushed snapshots", async () => {
    const push = createPushHost();
    const invoke = vi.fn();
    const client = createMailIpcClient(invoke, {
      requestId: () => crypto.randomUUID(),
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
