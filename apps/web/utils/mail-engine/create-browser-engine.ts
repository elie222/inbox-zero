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
  type WorkerRequest,
  type WorkerResponse,
} from "@/utils/mail-engine/worker-protocol";
import { browserStoragePressure } from "@/utils/mail-engine/storage-pressure";

export { browserMailEngineCapabilities };

export type BrowserMailEngine = MailEngine & {
  ensureAccount(input: {
    accountId: string;
    provider: "google" | "microsoft";
    generation?: string;
  }): Promise<void>;
};

export async function createBrowserMailEngine(
  input: BrowserEngineStart,
): Promise<BrowserMailEngine> {
  const start: BrowserEngineStart = {
    ...input,
    maxPendingOperations:
      input.maxPendingOperations ?? readPageMaxPendingOperations(),
  };
  if (browserMailEngineCapabilities().worker) {
    try {
      return await createWorkerOwnedEngine(start);
    } catch {
      // Dedicated workers can fail in private mode or without module workers.
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
    else waiter.reject(new Error(message.message));
  });
  worker.addEventListener("error", (event) => {
    for (const waiter of pending.values()) {
      waiter.reject(new Error(event.message || "mail engine worker failed"));
    }
    pending.clear();
  });

  await request(worker, pending, {
    id: crypto.randomUUID(),
    type: "start",
    input,
  });

  function observe<T>(
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
    request(worker, pending, {
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
        request(worker, pending, {
          id: crypto.randomUUID(),
          type: "unobserve",
          handleId,
        }).catch(() => undefined);
      },
    };
  }

  return {
    observeMailbox: (query) => observe("mailbox", [query]),
    observeMailboxWindow: (query) => {
      const handle = observe<MailboxView>("mailboxWindow", [query]);
      return {
        ...handle,
        loadMore: () =>
          request(worker, pending, {
            id: crypto.randomUUID(),
            type: "loadMore",
            handleId: handle.handleId,
          }) as Promise<void>,
      };
    },
    observeConversation: (key, page) => observe("conversation", [key, page]),
    observeOperation: (key) => observe("operation", [key]),
    submitMetadata: (payload) =>
      callWorker(worker, pending, "submitMetadata", [payload]),
    submitConversations: (payload) =>
      callWorker(worker, pending, "submitConversations", [payload]),
    saveDraft: (payload) => callWorker(worker, pending, "saveDraft", [payload]),
    readDraft: (payload) => callWorker(worker, pending, "readDraft", [payload]),
    async stageDraftAttachment(input) {
      const bytes = await collectWorkerBytes(input.bytes);
      return callWorker(worker, pending, "stageDraftAttachment", [
        { ...input, bytes },
      ]);
    },
    submitSend: (payload) =>
      callWorker(worker, pending, "submitSend", [payload]),
    cancelOperation: (payload) =>
      callWorker(worker, pending, "cancelOperation", [payload]),
    requestSync: (accountIds) =>
      requestSyncUnlessOffline(pageConnectivityOnline(), () =>
        callWorker<WorkAdmission>(worker, pending, "requestSync", [accountIds]),
      ),
    ensureAccount: (account) =>
      callWorker<void>(worker, pending, "ensureAccount", [account]),
    ensureMessageContent: (key) =>
      callWorker(worker, pending, "ensureMessageContent", [key]),
    getDiagnostics: (accountId) =>
      callWorker(worker, pending, "getDiagnostics", [accountId]),
    purgeAccount: (accountId) =>
      callWorker(worker, pending, "purgeAccount", [accountId]),
    inspect: () => callWorker(worker, pending, "inspect", []),
    runUntil: (deadlineMs) =>
      callWorker(worker, pending, "runUntil", [deadlineMs]),
    async close() {
      try {
        await request(worker, pending, {
          id: crypto.randomUUID(),
          type: "close",
        });
      } finally {
        // SAHPool keeps OPFS handles until the worker is gone, even if the
        // graceful close RPC fails.
        worker.terminate();
      }
    },
  };
}

function request(
  worker: Worker,
  pending: Map<
    string,
    { resolve: (value: unknown) => void; reject: (error: Error) => void }
  >,
  message: WorkerRequest,
) {
  return new Promise((resolve, reject) => {
    pending.set(message.id, { resolve, reject });
    worker.postMessage(message);
  });
}

function callWorker<T>(
  worker: Worker,
  pending: Map<
    string,
    { resolve: (value: unknown) => void; reject: (error: Error) => void }
  >,
  method: string,
  args: unknown[],
) {
  return request(worker, pending, {
    id: crypto.randomUUID(),
    type: "call",
    method,
    args,
  }) as Promise<T>;
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function collectWorkerBytes(bytes: AsyncIterable<Uint8Array>) {
  const chunks: Uint8Array[] = [];
  let size = 0;
  for await (const chunk of bytes) {
    size += chunk.byteLength;
    chunks.push(chunk);
  }
  const collected = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    collected.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return collected;
}
