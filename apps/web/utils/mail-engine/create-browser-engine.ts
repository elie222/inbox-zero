import {
  createMailEngine,
  createHostRuntime,
  type MailEngine,
} from "@inboxzero/mail-core/engine";
import {
  createBackendAssistantSource,
  createBackendMailboxSource,
  createBackendOperationExecutor,
} from "@inboxzero/mail-core/protocol/backend-adapter";
import { createSqliteMailStore } from "@inboxzero/mail-sqlite/store";
import type { QueryHandle, QuerySnapshot } from "@inboxzero/mail-core/queries";
import { createMailHttpRequest } from "@/utils/mail-engine/http";
import { createWasmSqliteDriver } from "@/utils/mail-engine/wasm-sqlite";
import {
  browserMailEngineCapabilities,
  readPageMaxPendingOperations,
  shouldReleaseDeferredOnStart,
  type BrowserEngineStart,
  type WorkerRequest,
  type WorkerResponse,
} from "@/utils/mail-engine/worker-protocol";
import { browserStoragePressure } from "@/utils/mail-engine/storage-pressure";

export { browserMailEngineCapabilities };

export async function createBrowserMailEngine(
  input: BrowserEngineStart,
): Promise<MailEngine> {
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
): Promise<MailEngine> {
  const request = createMailHttpRequest(input.accountId);
  const driver = await createWasmSqliteDriver({ persist: input.persist });
  const store = await createSqliteMailStore(driver, {
    maxPendingOperations: input.maxPendingOperations,
  });
  await store.ensureAccount({
    accountId: input.accountId,
    provider: input.provider,
    generation: input.generation ?? input.accountId,
  });
  const engine = createMailEngine({
    store,
    source: createBackendMailboxSource({ request, accountId: input.accountId }),
    executor: createBackendOperationExecutor({
      request,
      accountId: input.accountId,
    }),
    assistant: createBackendAssistantSource({
      request,
      accountId: input.accountId,
    }),
    runtime: createHostRuntime({ storagePressure: browserStoragePressure }),
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
  return {
    ...engine,
    async close() {
      stopped = true;
      await originalClose();
      await loop;
    },
  };
}

async function createWorkerOwnedEngine(
  input: BrowserEngineStart,
): Promise<MailEngine> {
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
    kind: "mailbox" | "conversation" | "operation",
    args: unknown[],
  ): QueryHandle<T> {
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
    observeConversation: (key, page) => observe("conversation", [key, page]),
    observeOperation: (key) => observe("operation", [key]),
    submitMetadata: (payload) =>
      callWorker(worker, pending, "submitMetadata", [payload]),
    submitConversations: (payload) =>
      callWorker(worker, pending, "submitConversations", [payload]),
    saveDraft: (payload) => callWorker(worker, pending, "saveDraft", [payload]),
    readDraft: (payload) => callWorker(worker, pending, "readDraft", [payload]),
    submitSend: (payload) =>
      callWorker(worker, pending, "submitSend", [payload]),
    cancelOperation: (payload) =>
      callWorker(worker, pending, "cancelOperation", [payload]),
    requestSync: (accountIds) =>
      callWorker(worker, pending, "requestSync", [accountIds]),
    ensureMessageContent: (key) =>
      callWorker(worker, pending, "ensureMessageContent", [key]),
    getDiagnostics: (accountId) =>
      callWorker(worker, pending, "getDiagnostics", [accountId]),
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
