import { afterEach, describe, expect, it, vi } from "vitest";
import type { MailClient } from "@inboxzero/mail-core/engine";
import type { QueryHandle, QuerySnapshot } from "@inboxzero/mail-core/queries";
import {
  bindTabMailOwner,
  createBroadcastTabBus,
  createMemoryTabBus,
  createTabFollowerClient,
  disposeTabFollowerClient,
} from "./tab-channel";

describe("mail engine tab channel", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });
  it("lets a follower subscribe and submit through the owner", async () => {
    const bus = createMemoryTabBus();
    const submitted: string[] = [];
    const owner = stubClient({
      onSubmit(commandId) {
        submitted.push(commandId);
      },
    });
    bindTabMailOwner({ client: owner, bus });
    const follower = createTabFollowerClient({ accountId: "acc-1", bus });
    const handle = follower.observeMailbox({
      accountIds: ["acc-1"],
      predicate: { kind: "role", role: "inbox" },
      order: "newest_first",
      pageSize: 25,
      after: null,
    });
    await waitFor(() => handle.getSnapshot().status === "ready");
    expect(handle.getSnapshot().data?.counts.matchingConversations).toBe(1);
    const admission = await follower.submitMetadata({
      accountId: "acc-1",
      commandId: "archive-tab",
      targets: [{ accountId: "acc-1", messageId: "m1" }],
      change: { kind: "archive" },
    });
    expect(admission.status).toBe("queued");
    expect(submitted).toEqual(["archive-tab"]);
    handle.close();
  });

  it("does not throw when posting to a closed BroadcastChannel", () => {
    const channel = {
      postMessage() {
        throw new DOMException("Channel is closed", "InvalidStateError");
      },
      addEventListener() {},
      removeEventListener() {},
    } as unknown as BroadcastChannel;
    const bus = createBroadcastTabBus(channel);
    expect(() => bus.post({ type: "hello", accountId: "acc-1" })).not.toThrow();
  });

  it("rejects in-flight follower calls after dispose", async () => {
    const bus = createMemoryTabBus();
    const follower = createTabFollowerClient({ accountId: "acc-1", bus });
    const pending = follower.getDiagnostics("acc-1");
    disposeTabFollowerClient(follower);
    await expect(pending).rejects.toThrow("channel_closed");
  });

  it("lets one owner serve a second account after the follower announces it", async () => {
    const bus = createMemoryTabBus();
    const ensuredAccounts: string[] = [];
    bindTabMailOwner({
      client: stubClient({ onSubmit() {} }),
      bus,
      ensureAccount: async (account) => {
        ensuredAccounts.push(account.accountId);
      },
    });
    const follower = createTabFollowerClient({
      accountId: "acc-2",
      provider: "microsoft",
      bus,
    });

    await waitFor(() => ensuredAccounts.includes("acc-2"));
    expect(ensuredAccounts).toContain("acc-2");
    await expect(follower.getDiagnostics("acc-2")).resolves.toMatchObject({
      connection: "ready",
    });
  });

  it("rejects load more when the owner cannot serve a mailbox window", async () => {
    const bus = createMemoryTabBus();
    bindTabMailOwner({ client: stubClient({ onSubmit() {} }), bus });
    const follower = createTabFollowerClient({ accountId: "acc-1", bus });
    const handle = follower.observeMailboxWindow?.({
      accountIds: ["acc-1"],
      predicate: { kind: "role", role: "inbox" },
      order: "newest_first",
      pageSize: 25,
      after: null,
    });

    await waitFor(() => handle?.getSnapshot().status === "ready");
    await expect(handle?.loadMore()).rejects.toThrow(
      "mailbox_window_unavailable",
    );
  });

  it("re-announces a follower when the owner becomes ready after a cold start", async () => {
    const bus = createMemoryTabBus();
    const follower = createTabFollowerClient({
      accountId: "acc-2",
      provider: "microsoft",
      bus,
    });
    const ensuredAccounts: string[] = [];

    bindTabMailOwner({
      client: stubClient({ onSubmit() {} }),
      bus,
      ensureAccount: async (account) => {
        ensuredAccounts.push(account.accountId);
      },
    });
    bus.post({ type: "ready" });

    await waitFor(() => ensuredAccounts.includes("acc-2"));
    expect(ensuredAccounts).toContain("acc-2");
    await expect(follower.getDiagnostics("acc-2")).resolves.toMatchObject({
      connection: "ready",
    });
  });

  it("does not ask the owner to release deferred sends while offline", async () => {
    const bus = createMemoryTabBus();
    const syncs: string[][] = [];
    const owner = stubClient({
      onRequestSync(accountIds) {
        syncs.push(accountIds);
      },
    });
    bindTabMailOwner({ client: owner, bus });
    const follower = createTabFollowerClient({ accountId: "acc-1", bus });
    vi.stubGlobal("navigator", { onLine: false });
    await expect(follower.requestSync(["acc-1"])).resolves.toEqual({
      status: "scheduled",
    });
    expect(syncs).toEqual([]);
    disposeTabFollowerClient(follower);
  });
});

function stubClient(input: {
  onSubmit?: (commandId: string) => void;
  onRequestSync?: (accountIds: string[]) => void;
}): MailClient {
  const snapshot: QuerySnapshot<{
    conversations: unknown[];
    counts: { matchingConversations: number; unreadConversations: number };
    coverage: unknown[];
    nextPage: null;
  }> = {
    status: "ready",
    revision: { databaseEpoch: "e", sequence: 1 },
    data: {
      conversations: [],
      counts: { matchingConversations: 1, unreadConversations: 1 },
      coverage: [],
      nextPage: null,
    },
    refreshing: false,
    error: null,
  };
  function handle<T>(value: QuerySnapshot<T>): QueryHandle<T> {
    const listeners = new Set<() => void>();
    return {
      getSnapshot: () => value,
      subscribe: (listener) => {
        listeners.add(listener);
        queueMicrotask(listener);
        return () => listeners.delete(listener);
      },
      close: () => listeners.clear(),
    };
  }
  return {
    observeMailbox: () => handle(snapshot),
    observeConversation: () => handle(snapshot as never),
    observeOperation: () => handle(snapshot as never),
    async submitMetadata(command) {
      input.onSubmit?.(command.commandId);
      return {
        status: "queued",
        operation: {
          accountId: command.accountId,
          operationId: command.commandId,
        },
        revision: { databaseEpoch: "e", sequence: 2 },
      };
    },
    async submitConversations() {
      return { status: "rejected", code: "unsupported" };
    },
    async saveDraft() {
      return { status: "rejected", code: "invalid" };
    },
    async readDraft() {
      return { status: "missing" };
    },
    async submitSend() {
      return { status: "rejected", code: "unsupported" };
    },
    async cancelOperation() {
      return { status: "not_found" };
    },
    async requestSync(accountIds) {
      input.onRequestSync?.(accountIds);
      return { status: "scheduled" };
    },
    async ensureMessageContent() {
      return { status: "scheduled" };
    },
    async getDiagnostics() {
      return {
        accountId: "acc-1",
        revision: { databaseEpoch: "e", sequence: 1 },
        connection: "ready",
        coverage: [],
        pendingOperations: 0,
        uncertainOperations: 0,
        pendingJobs: 0,
        oldestPendingAtMs: null,
        commands: [],
      };
    },
    async purgeAccount() {
      return { databaseEpoch: "e", sequence: 1 };
    },
  };
}

async function waitFor(match: () => boolean) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (match()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}
