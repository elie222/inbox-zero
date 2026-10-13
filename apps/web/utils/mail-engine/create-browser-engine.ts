import {
  createMailEngine,
  createHostRuntime,
  type MailEngine,
  type WorkAdmission,
} from "@inboxzero/mail-core/engine";
import { createSqliteMailStore } from "@inboxzero/mail-sqlite/store";
import type {
  MailboxView,
  QueryHandle,
  QuerySnapshot,
} from "@inboxzero/mail-core/queries";
import { createMailHttpRequest } from "@/utils/mail-engine/http";
import { createRoutedBackendAdapter } from "@inboxzero/mail-core/protocol/routed-backend-adapter";
import { createWasmSqliteDriver } from "@/utils/mail-engine/wasm-sqlite";
import {
  browserMailEngineCapabilities,
  pageConnectivityOnline,
  readPageMaxPendingOperations,
  requestSyncUnlessOffline,
  shouldReleaseDeferredOnStart,
  type BrowserEngineStart,
  type WorkerObserveKind,
  type WorkerRequest,
  type WorkerResponse,
} from "@/utils/mail-engine/worker-protocol";
import { browserStoragePressure } from "@/utils/mail-engine/storage-pressure";

export { browserMailEngineCapabilities };

export type BrowserMailEngine = MailEngine & {
  ensureAccount(input: {
    accountId: string;
    provider: "google" | "microsoft" | "icloud";
    generation?: string;
  }): Promise<void>;
};

export async function createBrowserMailEngine(
  input: BrowserEngineStart,
  signal?: AbortSignal,
): Promise<BrowserMailEngine> {
  const start: BrowserEngineStart = {
    ...input,
    maxPendingOperations:
      input.maxPendingOperations ?? readPageMaxPendingOperations(),
  };
  if (browserMailEngineCapabilities().worker) {
    for (let attempt = 0; ; attempt++) {
      signal?.throwIfAborted();
      try {
        return await createWorkerOwnedEngine(start, signal);
      } catch (error) {
        signal?.throwIfAborted();
        // WebKit can retain a previous worker's file locks briefly after teardown.
        if (attempt < 3 && isTransientStorageError(error)) {
          await delay(250 * 2 ** attempt);
          continue;
        }
        // Persistent OPFS requires a worker. An in-tab attempt only masks its error.
        if (input.persist !== false) throw error;
        break;
      }
    }
  }
  return createInTabEngine(start);
}

async function createInTabEngine(
  input: BrowserEngineStart,
): Promise<BrowserMailEngine> {
  const driver = await createWasmSqliteDriver({ persist: input.persist });
  const runtime = createHostRuntime({
    storagePressure: browserStoragePressure,
  });
  const store = await createSqliteMailStore(driver, {
    maxPendingOperations: input.maxPendingOperations,
    runtime,
  });
  const ensureAccount: BrowserMailEngine["ensureAccount"] = async (account) => {
    await store.ensureAccount({
      accountId: account.accountId,
      provider: account.provider,
      generation: account.generation ?? account.accountId,
    });
  };
  await ensureAccount(input);
  const ports = createRoutedBackendAdapter({
    requestFor: createMailHttpRequest,
  });
  const engine = createMailEngine({
    store,
    source: ports.source,
    executor: ports.executor,
    assistant: ports.assistant,
    runtime,
    ownerId: "browser-owner",
  });
  if (shouldReleaseDeferredOnStart(input.online)) {
    await engine.requestSync([input.accountId]);
  }
  let stopped = false;
  const loop = (async () => {
    while (!stopped) {
      try {
        await engine.runUntil(Date.now() + 2000);
      } catch {
        await delay(1000);
      }
      await delay(250);
    }
  })();
  const originalClose = engine.close.bind(engine);
  const originalRequestSync = engine.requestSync.bind(engine);
  return {
    ...engine,
    // Local autocomplete stays off the UI thread if dedicated workers fail.
    queryContactSuggestions: undefined,
    ensureAccount,
    requestSync: (accountIds) =>
      requestSyncUnlessOffline(pageConnectivityOnline(), () =>
        originalRequestSync(accountIds),
      ),
    async close() {
      stopped = true;
      await originalClose();
      await loop;
    },
  };
}

async function createWorkerOwnedEngine(
  input: BrowserEngineStart,
  signal?: AbortSignal,
): Promise<BrowserMailEngine> {
  const worker = new Worker(new URL("./engine-worker.ts", import.meta.url), {
    type: "module",
  });
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
  let terminated = false;
  let terminationError = new Error("mail engine worker closed");

  function terminate(error = terminationError) {
    if (terminated) return;
    terminated = true;
    terminationError = error;
    signal?.removeEventListener("abort", onAbort);
    worker.terminate();
    for (const waiter of pending.values()) waiter.reject(error);
    pending.clear();
  }

  function onAbort() {
    terminate(
      signal?.reason instanceof Error
        ? signal.reason
        : new DOMException("Mail page left", "AbortError"),
    );
  }

  function send(message: WorkerRequest): Promise<unknown> {
    if (terminated) return Promise.reject(terminationError);
    return new Promise((resolve, reject) => {
      pending.set(message.id, { resolve, reject });
      try {
        worker.postMessage(message);
      } catch (error) {
        pending.delete(message.id);
        reject(error);
      }
    });
  }

  signal?.addEventListener("abort", onAbort, { once: true });
  if (signal?.aborted) onAbort();

  worker.addEventListener("message", (event: MessageEvent<WorkerResponse>) => {
    const message = event.data;
    if (message.type === "snapshot") {
      const observation = observations.get(message.handleId);
      if (!observation) return;
      observation.snapshot = message.snapshot;
      for (const listener of observation.listeners) listener();
      return;
    }
    const waiter = pending.get(message.id);
    if (!waiter) return;
    pending.delete(message.id);
    if (message.type === "ok") waiter.resolve(message.value);
    else {
      const error = new Error(message.message);
      error.name = message.errorName ?? "Error";
      waiter.reject(error);
    }
  });
  worker.addEventListener("error", (event) => {
    terminate(new Error(event.message || "mail engine worker failed"));
  });

  try {
    await send({
      id: crypto.randomUUID(),
      type: "start",
      input,
    });
  } catch (error) {
    // A partially initialized worker may still own OPFS handles.
    terminate();
    throw error;
  }

  function observe<T>(
    kind: WorkerObserveKind,
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
    send({
      id: crypto.randomUUID(),
      type: "observe",
      kind,
      handleId,
      args,
    }).catch(() => undefined);
    return {
      handleId,
      getSnapshot: () => observation.snapshot as QuerySnapshot<T>,
      subscribe: (listener) => {
        observation.listeners.add(listener);
        return () => observation.listeners.delete(listener);
      },
      close: () => {
        observations.delete(handleId);
        send({
          id: crypto.randomUUID(),
          type: "unobserve",
          handleId,
        }).catch(() => undefined);
      },
    };
  }

  return {
    queryContactSuggestions: (query) =>
      callWorker(send, "queryContactSuggestions", [query]),
    observeMailbox: (query) => observe("mailbox", [query]),
    observeMailboxCounts: (query) => observe("mailboxCounts", [query]),
    observeMailboxWindow: (query) => {
      const handle = observe<MailboxView>("mailboxWindow", [query]);
      return {
        ...handle,
        loadMore: () =>
          send({
            id: crypto.randomUUID(),
            type: "loadMore",
            handleId: handle.handleId,
          }) as Promise<void>,
      };
    },
    observeConversation: (key, page) => observe("conversation", [key, page]),
    observeOperation: (key) => observe("operation", [key]),
    submitMetadata: (payload) => callWorker(send, "submitMetadata", [payload]),
    submitConversations: (payload) =>
      callWorker(send, "submitConversations", [payload]),
    saveDraft: (payload) => callWorker(send, "saveDraft", [payload]),
    readDraft: (payload) => callWorker(send, "readDraft", [payload]),
    submitSend: (payload) => callWorker(send, "submitSend", [payload]),
    cancelOperation: (payload) =>
      callWorker(send, "cancelOperation", [payload]),
    requestSync: (accountIds) =>
      requestSyncUnlessOffline(pageConnectivityOnline(), () =>
        callWorker<WorkAdmission>(send, "requestSync", [accountIds]),
      ),
    ensureAccount: (account) =>
      callWorker<void>(send, "ensureAccount", [account]),
    ensureMessageContent: (key) =>
      callWorker(send, "ensureMessageContent", [key]),
    getDiagnostics: (accountId) =>
      callWorker(send, "getDiagnostics", [accountId]),
    purgeAccount: (accountId) => callWorker(send, "purgeAccount", [accountId]),
    retainAccounts: (accountIds) =>
      callWorker<void>(send, "retainAccounts", [accountIds]),
    inspect: () => callWorker(send, "inspect", []),
    runUntil: (deadlineMs) => callWorker(send, "runUntil", [deadlineMs]),
    async close() {
      if (terminated) return;
      try {
        await send({
          id: crypto.randomUUID(),
          type: "close",
        });
      } finally {
        // SAHPool keeps OPFS handles until the worker is gone, even if the
        // graceful close RPC fails.
        terminate();
      }
    },
  };
}

function callWorker<T>(
  send: (message: WorkerRequest) => Promise<unknown>,
  method: string,
  args: unknown[],
) {
  return send({
    id: crypto.randomUUID(),
    type: "call",
    method,
    args,
  }) as Promise<T>;
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isTransientStorageError(error: unknown) {
  return (
    error instanceof Error &&
    [
      "UnknownError",
      "InvalidStateError",
      "NoModificationAllowedError",
    ].includes(error.name)
  );
}
