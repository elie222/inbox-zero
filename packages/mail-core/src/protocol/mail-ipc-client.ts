import type { MailClient } from "../engine";
import type { QueryHandle, QuerySnapshot } from "../queries";
import { MAIL_IPC_PROTOCOL_VERSION } from "./mail-ipc";

export function createMailIpcClient(
  invoke: (payload: unknown) => Promise<unknown>,
  options?: {
    requestId?: () => string;
    pollMs?: number;
  },
): MailClient & { inspect(): Promise<unknown> } {
  const requestId = options?.requestId ?? defaultRequestId;
  const pollMs = options?.pollMs ?? 750;

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
      observeSnapshot(call, "observeMailbox", query, pollMs),
    observeConversation: (key, page) =>
      observeSnapshot(
        call,
        "observeConversation",
        {
          key,
          after: page.after,
          pageSize: page.pageSize,
        },
        pollMs,
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
    requestSync: (accountIds) => call("requestSync", { accountIds }),
    ensureMessageContent: (key) => call("ensureMessageContent", key),
    getDiagnostics: (accountId) => call("getDiagnostics", { accountId }),
    inspect: () => call("inspect", {}),
  };
}

function observeSnapshot<T>(
  call: (method: string, payload: unknown) => Promise<T>,
  method: "observeMailbox" | "observeConversation",
  payload: unknown,
  pollMs: number,
): QueryHandle<T> {
  let snapshot: QuerySnapshot<T> = {
    status: "loading",
    revision: null,
    data: null,
    refreshing: true,
    error: null,
  };
  const listeners = new Set<() => void>();
  let closed = false;
  async function refresh() {
    const next = (await call(method, payload)) as QuerySnapshot<T>;
    if (closed) return;
    snapshot = next;
    for (const listener of listeners) listener();
  }
  const timer = setInterval(() => {
    refresh().catch(() => undefined);
  }, pollMs);
  refresh().catch(() => undefined);
  return {
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
    },
  };
}

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
