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
    observeOperation: (key) =>
      observeSnapshot(call, "observeOperation", () => key, pollMs, handles),
    observeAccounts: () =>
      observeSnapshot(call, "observeAccounts", () => ({}), pollMs, handles),
    observeDrafts: (accountIds) =>
      observeSnapshot(
        call,
        "observeDrafts",
        () => ({ accountIds }),
        pollMs,
        handles,
      ),
    observeOutbox: (accountIds) =>
      observeSnapshot(
        call,
        "observeOutbox",
        () => ({ accountIds }),
        pollMs,
        handles,
      ),
    observeMailboxCatalog: (accountId) =>
      observeSnapshot(
        call,
        "observeMailboxCatalog",
        () => ({ accountId }),
        pollMs,
        handles,
      ),
    submitMetadata: (payload) => call("submitMetadata", payload),
    submitConversations: (payload) => call("submitConversations", payload),
    saveDraft: (payload) => call("saveDraft", payload),
    readDraft: (payload) => call("readDraft", payload),
    async stageDraftAttachment(input) {
      const bytes = await collectBytes(input.bytes);
      return call("stageDraftAttachment", {
        accountId: input.accountId,
        draftId: input.draftId,
        attachmentId: input.attachmentId,
        filename: input.filename,
        contentType: input.contentType,
        checksum: input.checksum,
        sizeBytes: input.sizeBytes,
        inline: input.inline,
        contentBase64: bytesToBase64(bytes),
      });
    },
    submitSend: (payload) => call("submitSend", payload),
    cancelOperation: (payload) => call("cancelOperation", payload),
    requestSync: (accountIds) =>
      call("requestSync", {
        accountIds,
        ...(options?.provider ? { provider: options.provider } : {}),
      }),
    ensureMessageContent: (key) => call("ensureMessageContent", key),
    ensureConversation: (key) => call("ensureConversation", key),
    getDiagnostics: (accountId) => call("getDiagnostics", { accountId }),
    purgeAccount: (accountId) => call("purgeAccount", { accountId }),
    referencedBlobIds: () => call("referencedBlobIds", {}),
    inspect: () => call("inspect", {}),
    async close() {
      for (const handle of [...handles]) handle.close();
    },
  };
}

function observeSnapshot<T>(
  call: (method: string, payload: unknown) => Promise<T>,
  method: string,
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

async function collectBytes(bytes: AsyncIterable<Uint8Array>) {
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

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  if (typeof btoa === "function") return btoa(binary);
  const nodeBuffer = (
    globalThis as {
      Buffer?: {
        from(input: Uint8Array): { toString(encoding: "base64"): string };
      };
    }
  ).Buffer;
  if (!nodeBuffer) throw new Error("base64 encoding is unavailable");
  return nodeBuffer.from(bytes).toString("base64");
}

function defaultRequestId() {
  const cryptoObj = globalThis.crypto;
  if (typeof cryptoObj?.randomUUID === "function")
    return cryptoObj.randomUUID();
  throw new Error("createMailIpcClient requires options.requestId");
}
