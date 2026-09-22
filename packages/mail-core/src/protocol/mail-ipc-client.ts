import type { MailboxWindowHandle, MailClient } from "../engine";
import type { MailboxView, QueryHandle, QuerySnapshot } from "../queries";
import { MAIL_IPC_PROTOCOL_VERSION } from "./mail-ipc";

export function createMailIpcClient(
  invoke: (payload: unknown) => Promise<unknown>,
  options?: {
    requestId?: () => string;
    pollMs?: number;
    provider?: "google" | "microsoft";
  },
): MailClient & { inspect(): Promise<unknown> } {
  const requestId = options?.requestId ?? defaultRequestId;
  const pollMs = options?.pollMs ?? 750;
  const handles = new Set<{ close(): void }>();

  async function call(method: string, payload: unknown) {
    const response = (await invoke({
      protocolVersion: MAIL_IPC_PROTOCOL_VERSION,
      requestId: requestId(),
      method,
      payload,
    })) as { status?: string; result?: unknown };
    if (response?.status !== "ok") {
      throw new Error(`Mail engine ${method} failed`);
    }
    return response.result as never;
  }

  return {
    observeMailbox: (query) =>
      observeSnapshot(call, "observeMailbox", () => query, pollMs, handles),
    observeMailboxWindow: (query) =>
      observeMailboxWindow(call, query, pollMs, handles),
    observeConversation: (key, page) =>
      observeSnapshot(
        call,
        "observeConversation",
        () => ({
          key,
          after: page.after,
          pageSize: page.pageSize,
        }),
        pollMs,
        handles,
      ),
    observeOperation() {
      return unavailableHandle();
    },
    submitMetadata: (payload) => call("submitMetadata", payload),
    submitConversations: (payload) => call("submitConversations", payload),
    saveDraft: (payload) => call("saveDraft", payload),
    readDraft: (payload) => call("readDraft", payload),
    submitSend: (payload) => call("submitSend", payload),
    cancelOperation: (payload) => call("cancelOperation", payload),
    requestSync: (accountIds) =>
      call("requestSync", {
        accountIds,
        ...(options?.provider ? { provider: options.provider } : {}),
      }),
    ensureMessageContent: (key) => call("ensureMessageContent", key),
    getDiagnostics: (accountId) => call("getDiagnostics", { accountId }),
    purgeAccount: (accountId) => call("purgeAccount", { accountId }),
    inspect: () => call("inspect", {}),
    async close() {
      for (const handle of [...handles]) handle.close();
    },
  };
}

function observeSnapshot<T>(
  call: (method: string, payload: unknown) => Promise<T>,
  method: "observeMailbox" | "observeMailboxWindow" | "observeConversation",
  payload: () => unknown,
  pollMs: number,
  handles: Set<{ close(): void }>,
): RefreshableQueryHandle<T> {
  let snapshot: QuerySnapshot<T> = {
    status: "loading",
    revision: null,
    data: null,
    refreshing: true,
    error: null,
  };
  const listeners = new Set<() => void>();
  let closed = false;
  let inFlight = false;
  let shouldRefresh = false;
  let pendingRefreshes: Array<() => void> = [];

  const publish = (next: QuerySnapshot<T>) => {
    if (closed) return;
    snapshot = next;
    for (const listener of listeners) listener();
  };

  const refresh = () => {
    if (closed) return Promise.resolve();
    shouldRefresh = true;
    const refreshPromise = new Promise<void>((resolve) => {
      pendingRefreshes.push(resolve);
    });
    drainRefreshes().catch(() => undefined);
    return refreshPromise;
  };

  async function drainRefreshes() {
    if (inFlight) return;
    inFlight = true;
    try {
      while (!closed && shouldRefresh) {
        shouldRefresh = false;
        const waitingForThisRun = pendingRefreshes;
        pendingRefreshes = [];
        try {
          const next = (await call(method, payload())) as QuerySnapshot<T>;
          publish(next);
        } catch {
          publish({
            status: "error",
            revision: snapshot.revision,
            data: snapshot.data,
            refreshing: false,
            error: { code: "unavailable", retryable: true },
          });
        } finally {
          for (const resolve of waitingForThisRun) resolve();
        }
      }
    } finally {
      inFlight = false;
    }
  }

  const timer = setInterval(() => {
    refresh().catch(() => undefined);
  }, pollMs);
  refresh().catch(() => undefined);
  const handle: RefreshableQueryHandle<T> = {
    refresh,
    getSnapshot: () => snapshot,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    close: () => {
      closed = true;
      clearInterval(timer);
      listeners.clear();
      for (const resolve of pendingRefreshes) resolve();
      pendingRefreshes = [];
      handles.delete(handle);
    },
  };
  handles.add(handle);
  return handle;
}

function observeMailboxWindow(
  call: (method: string, payload: unknown) => Promise<unknown>,
  query: Parameters<MailClient["observeMailbox"]>[0],
  pollMs: number,
  handles: Set<{ close(): void }>,
): MailboxWindowHandle {
  let pageCount = 1;
  const handle = observeSnapshot(
    call,
    "observeMailboxWindow",
    () => ({ query, pageCount }),
    pollMs,
    handles,
  ) as RefreshableQueryHandle<MailboxView> & MailboxWindowHandle;
  handle.loadMore = async () => {
    pageCount += 1;
    await handle.refresh();
  };
  return handle;
}

type RefreshableQueryHandle<T> = QueryHandle<T> & {
  refresh(): Promise<void>;
};

function unavailableHandle<T>(): QueryHandle<T> {
  const snapshot: QuerySnapshot<T> = {
    status: "unavailable",
    revision: null,
    data: null,
    refreshing: false,
    error: { code: "unsupported", retryable: false },
  };
  return {
    getSnapshot: () => snapshot,
    subscribe: () => () => undefined,
    close: () => undefined,
  };
}

function defaultRequestId() {
  return crypto.randomUUID();
}
