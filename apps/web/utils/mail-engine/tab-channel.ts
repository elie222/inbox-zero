import type { MailClient, WorkAdmission } from "@inboxzero/mail-core/engine";
import type {
  MailboxView,
  QueryHandle,
  QuerySnapshot,
} from "@inboxzero/mail-core/queries";
import {
  pageConnectivityOnline,
  requestSyncUnlessOffline,
} from "@/utils/mail-engine/worker-protocol";

export const MAIL_ENGINE_OWNER_LOCK = "inbox-zero:mail-engine-owner";
export const MAIL_ENGINE_TAB_CHANNEL = "inbox-zero:mail-engine-tabs";

export type TabMailMessage =
  | {
      type: "hello";
      accountId: string;
      provider?: "google" | "microsoft";
    }
  | { type: "ready" }
  | { type: "owner"; accountId: string }
  | {
      type: "call";
      id: string;
      accountId: string;
      method: string;
      args: unknown[];
    }
  | {
      type: "observe";
      id: string;
      accountId: string;
      handleId: string;
      kind: "mailbox" | "mailboxWindow" | "conversation" | "operation";
      args: unknown[];
    }
  | { type: "loadMore"; id: string; handleId: string }
  | { type: "unobserve"; id: string; handleId: string }
  | { type: "ok"; id: string; value?: unknown }
  | { type: "error"; id: string; message: string }
  | { type: "snapshot"; handleId: string; snapshot: QuerySnapshot<unknown> };

export type TabMailBus = {
  post(message: TabMailMessage): void;
  subscribe(listener: (message: TabMailMessage) => void): () => void;
};

export function createMemoryTabBus(): TabMailBus {
  const listeners = new Set<(message: TabMailMessage) => void>();
  return {
    post(message) {
      for (const listener of [...listeners]) listener(message);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

export function bindTabMailOwner(input: {
  client: MailClient;
  bus: TabMailBus;
  ensureAccount?: (input: {
    accountId: string;
    provider: "google" | "microsoft";
  }) => Promise<void>;
}): () => void {
  const handles = new Map<
    string,
    { close: () => void; loadMore?: () => Promise<void> }
  >();
  const unsubscribe = input.bus.subscribe((message) => {
    if (message.type === "hello") {
      announceOwner(input, message);
      return;
    }
    if (message.type === "loadMore") {
      const handle = handles.get(message.handleId);
      if (!handle?.loadMore) {
        input.bus.post({
          type: "error",
          id: message.id,
          message: "mailbox_window_unavailable",
        });
        return;
      }
      handle
        .loadMore()
        .then(() => input.bus.post({ type: "ok", id: message.id }))
        .catch((error) =>
          input.bus.post({
            type: "error",
            id: message.id,
            message: error instanceof Error ? error.message : "owner_error",
          }),
        );
      return;
    }
    if (message.type === "unobserve") {
      handles.get(message.handleId)?.close();
      handles.delete(message.handleId);
      input.bus.post({ type: "ok", id: message.id });
      return;
    }
    if (message.type === "observe") {
      const observed = observe(input.client, message.kind, message.args);
      handles.set(message.handleId, observed);
      observed.subscribe(() => {
        input.bus.post({
          type: "snapshot",
          handleId: message.handleId,
          snapshot: observed.getSnapshot(),
        });
      });
      input.bus.post({
        type: "snapshot",
        handleId: message.handleId,
        snapshot: observed.getSnapshot(),
      });
      input.bus.post({ type: "ok", id: message.id });
      return;
    }
    if (message.type !== "call") return;
    const method = input.client[message.method as keyof MailClient];
    if (typeof method !== "function") {
      input.bus.post({
        type: "error",
        id: message.id,
        message: `unsupported method ${message.method}`,
      });
      return;
    }
    (method as (...args: unknown[]) => Promise<unknown>)
      .apply(input.client, message.args)
      .then((value) => input.bus.post({ type: "ok", id: message.id, value }))
      .catch((error) =>
        input.bus.post({
          type: "error",
          id: message.id,
          message: error instanceof Error ? error.message : "owner_error",
        }),
      );
  });
  return () => {
    unsubscribe();
    for (const handle of handles.values()) handle.close();
    handles.clear();
  };
}

const followerDisposers = new WeakMap<MailClient, () => void>();

export function disposeTabFollowerClient(client: MailClient) {
  followerDisposers.get(client)?.();
}

export function createTabFollowerClient(input: {
  accountId: string;
  provider?: "google" | "microsoft";
  bus: TabMailBus;
}): MailClient {
  const pending = new Map<
    string,
    { resolve: (value: unknown) => void; reject: (error: Error) => void }
  >();
  const observations = new Map<
    string,
    {
      snapshot: QuerySnapshot<unknown>;
      listeners: Set<() => void>;
    }
  >();
  const announce = () =>
    input.bus.post({
      type: "hello",
      accountId: input.accountId,
      provider: input.provider,
    });
  const unsubscribe = input.bus.subscribe((message) => {
    if (message.type === "ready") {
      announce();
      return;
    }
    if (message.type === "snapshot") {
      const observation = observations.get(message.handleId);
      if (!observation) return;
      observation.snapshot = message.snapshot;
      for (const listener of observation.listeners) listener();
      return;
    }
    if (message.type !== "ok" && message.type !== "error") return;
    const waiter = pending.get(message.id);
    if (!waiter) return;
    pending.delete(message.id);
    if (message.type === "ok") waiter.resolve(message.value);
    else waiter.reject(new Error(message.message));
  });
  announce();

  function dispose() {
    unsubscribe();
    for (const waiter of pending.values()) {
      waiter.reject(new Error("channel_closed"));
    }
    pending.clear();
    observations.clear();
  }

  function call(method: string, args: unknown[]) {
    const id = crypto.randomUUID();
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      input.bus.post({
        type: "call",
        id,
        accountId: input.accountId,
        method,
        args,
      });
    });
  }

  function loadMoreRemote(handleId: string) {
    const id = crypto.randomUUID();
    return new Promise<void>((resolve, reject) => {
      pending.set(id, { resolve: () => resolve(), reject });
      input.bus.post({
        type: "loadMore",
        id,
        handleId,
      });
    });
  }

  function observeRemote<T>(
    kind: "mailbox" | "mailboxWindow" | "conversation" | "operation",
    args: unknown[],
  ): QueryHandle<T> & { handleId: string } {
    const handleId = crypto.randomUUID();
    const observation = {
      snapshot: {
        status: "loading",
        revision: null,
        data: null,
        refreshing: true,
        error: null,
      } satisfies QuerySnapshot<unknown>,
      listeners: new Set<() => void>(),
    };
    observations.set(handleId, observation);
    const id = crypto.randomUUID();
    pending.set(id, {
      resolve: () => undefined,
      reject: () => undefined,
    });
    input.bus.post({
      type: "observe",
      id,
      accountId: input.accountId,
      handleId,
      kind,
      args,
    });
    return {
      handleId,
      getSnapshot: () => observation.snapshot as QuerySnapshot<T>,
      subscribe: (listener) => {
        observation.listeners.add(listener);
        return () => observation.listeners.delete(listener);
      },
      close: () => {
        observations.delete(handleId);
        input.bus.post({
          type: "unobserve",
          id: crypto.randomUUID(),
          handleId,
        });
      },
    };
  }

  const client: MailClient = {
    observeMailbox: (query) => observeRemote("mailbox", [query]),
    observeMailboxWindow: (query) => {
      const handle = observeRemote<MailboxView>("mailboxWindow", [query]);
      return {
        ...handle,
        loadMore: () => loadMoreRemote(handle.handleId),
      };
    },
    observeConversation: (key, page) =>
      observeRemote("conversation", [key, page]),
    observeOperation: (key) => observeRemote("operation", [key]),
    submitMetadata: (payload) => call("submitMetadata", [payload]) as never,
    submitConversations: (payload) =>
      call("submitConversations", [payload]) as never,
    saveDraft: (payload) => call("saveDraft", [payload]) as never,
    readDraft: (payload) => call("readDraft", [payload]) as never,
    submitSend: (payload) => call("submitSend", [payload]) as never,
    cancelOperation: (payload) => call("cancelOperation", [payload]) as never,
    requestSync: (accountIds) =>
      requestSyncUnlessOffline(
        pageConnectivityOnline(),
        () => call("requestSync", [accountIds]) as Promise<WorkAdmission>,
      ),
    ensureMessageContent: (key) => call("ensureMessageContent", [key]) as never,
    async getDiagnostics(accountId) {
      return call("getDiagnostics", [accountId]) as never;
    },
    async purgeAccount(accountId) {
      return call("purgeAccount", [accountId]) as never;
    },
  };
  followerDisposers.set(client, () => {
    dispose();
    followerDisposers.delete(client);
  });
  return client;
}

export function createBroadcastTabBus(channel: BroadcastChannel): TabMailBus {
  return {
    post(message) {
      try {
        channel.postMessage(message);
      } catch {
        // Owner/follower effects close the channel on unmount; pending
        // hello/observe replies must not throw into React.
      }
    },
    subscribe(listener) {
      const handler = (event: MessageEvent<TabMailMessage>) => {
        listener(event.data);
      };
      channel.addEventListener("message", handler);
      return () => channel.removeEventListener("message", handler);
    },
  };
}

function observe(
  client: MailClient,
  kind: "mailbox" | "mailboxWindow" | "conversation" | "operation",
  args: unknown[],
) {
  if (kind === "mailbox") return client.observeMailbox(args[0] as never);
  if (kind === "mailboxWindow") {
    return (
      client.observeMailboxWindow?.(args[0] as never) ??
      client.observeMailbox(args[0] as never)
    );
  }
  if (kind === "conversation") {
    return client.observeConversation(args[0] as never, args[1] as never);
  }
  return client.observeOperation(args[0] as never);
}

function announceOwner(
  input: {
    bus: TabMailBus;
    ensureAccount?: (account: {
      accountId: string;
      provider: "google" | "microsoft";
    }) => Promise<void>;
  },
  message: Extract<TabMailMessage, { type: "hello" }>,
) {
  const postOwner = () =>
    input.bus.post({ type: "owner", accountId: message.accountId });
  if (!message.provider || !input.ensureAccount) {
    postOwner();
    return;
  }
  input
    .ensureAccount({
      accountId: message.accountId,
      provider: message.provider,
    })
    .then(postOwner)
    .catch(() => undefined);
}
