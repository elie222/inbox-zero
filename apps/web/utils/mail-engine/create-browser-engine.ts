import type { MailEngine, WorkAdmission } from "@inboxzero/mail-core/engine";
import type {
  MailboxView,
  QueryHandle,
  QuerySnapshot,
} from "@inboxzero/mail-core/queries";
import {
  pageConnectivityOnline,
  readPageMaxPendingOperations,
  requestSyncUnlessOffline,
  type BrowserEngineStart,
  type WorkerObserveKind,
  type WorkerRequest,
  type WorkerResponse,
} from "@/utils/mail-engine/worker-protocol";
import { MailEngineStartupError } from "./startup-error";

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
  // A failed SAH pool installation is cached by SQLite. Retry in a fresh
  // worker so partial pools and their handles cannot survive the attempt.
  for (let attempt = 0; ; attempt++) {
    try {
      return await startBrowserMailEngine(input);
    } catch (error) {
      if (
        !(error instanceof MailEngineStartupError) ||
        error.stage !== "opfs-open" ||
        !["NoModificationAllowedError", "InvalidStateError"].includes(
          error.name,
        ) ||
        attempt === 7
      ) {
        throw error;
      }
      await new Promise((resolve) =>
        setTimeout(resolve, Math.min(50 * 2 ** attempt, 1000)),
      );
    }
  }
}

async function startBrowserMailEngine(
  input: BrowserEngineStart,
): Promise<BrowserMailEngine> {
  let worker: Worker;
  try {
    worker = new Worker(new URL("./engine-worker.ts", import.meta.url), {
      type: "module",
    });
  } catch (error) {
    throw new MailEngineStartupError("worker-load", error);
  }
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
    if (message.type === "ok") {
      waiter.resolve(message.value);
    } else {
      const error = new Error(message.message);
      error.name = message.errorName ?? "Error";
      waiter.reject(
        message.stage
          ? new MailEngineStartupError(message.stage, error)
          : error,
      );
    }
  });
  worker.addEventListener("error", (event) => {
    for (const waiter of pending.values()) {
      waiter.reject(
        new MailEngineStartupError(
          "worker-load",
          new Error(event.message || "mail engine worker failed"),
        ),
      );
    }
    pending.clear();
  });

  let startupTimer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      request(worker, pending, {
        id: crypto.randomUUID(),
        type: "start",
        input: {
          ...input,
          maxPendingOperations:
            input.maxPendingOperations ?? readPageMaxPendingOperations(),
        },
      }),
      new Promise<never>((_, reject) => {
        startupTimer = setTimeout(
          () =>
            reject(
              new MailEngineStartupError(
                "worker-start",
                new Error("Mail engine worker startup timed out"),
              ),
            ),
          30_000,
        );
      }),
    ]);
  } catch (error) {
    worker.terminate();
    pending.clear();
    throw error instanceof MailEngineStartupError
      ? error
      : new MailEngineStartupError("worker-start", error);
  } finally {
    clearTimeout(startupTimer);
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
    queryContactSuggestions: (query) =>
      callWorker(worker, pending, "queryContactSuggestions", [query]),
    observeMailbox: (query) => observe("mailbox", [query]),
    observeMailboxCounts: (query) => observe("mailboxCounts", [query]),
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
    retainAccounts: (accountIds) =>
      callWorker<void>(worker, pending, "retainAccounts", [accountIds]),
    inspect: () => callWorker(worker, pending, "inspect", []),
    runUntil: (deadlineMs) =>
      callWorker(worker, pending, "runUntil", [deadlineMs]),
    async close() {
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        await Promise.race([
          request(worker, pending, { id: crypto.randomUUID(), type: "close" }),
          new Promise<void>((resolve) => {
            timer = setTimeout(resolve, 1000);
          }),
        ]);
      } finally {
        clearTimeout(timer);
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
