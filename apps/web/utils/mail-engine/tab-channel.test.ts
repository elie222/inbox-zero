import { describe, expect, it } from "vitest";
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
  it("lets a follower subscribe and submit through the owner", async () => {
    const bus = createMemoryTabBus();
    const submitted: string[] = [];
    const owner = stubClient({
      onSubmit(commandId) {
        submitted.push(commandId);
      },
    });
    bindTabMailOwner({ accountId: "acc-1", client: owner, bus });
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
});

function stubClient(input: {
  onSubmit: (commandId: string) => void;
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
      input.onSubmit(command.commandId);
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
    async requestSync() {
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
      };
    },
  };
}

async function waitFor(match: () => boolean) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (match()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}
