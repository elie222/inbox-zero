import type { MailboxWindowHandle, MailClient } from "../engine";
import { revisionEquals } from "../identities";
import type { MailboxView, QueryHandle, QuerySnapshot } from "../queries";
import { MAIL_IPC_PROTOCOL_VERSION } from "./mail-ipc";

export function createMailIpcClient(
  invoke: (payload: unknown) => Promise<unknown>,
  options: {
    /** Observations subscribe to snapshots the host pushes when data changes. */
    push: MailIpcPushTransport;
    requestId?: () => string;
    provider?: "google" | "microsoft";
  },
): MailClient & { inspect(): Promise<unknown> } {
  const requestId = options.requestId ?? defaultRequestId;
  const handles = new Set<{ close(): void }>();

  function envelope(method: string, payload: unknown) {
    return {
      protocolVersion: MAIL_IPC_PROTOCOL_VERSION,
      requestId: requestId(),
      method,
      payload,
    };
  }

  async function call(method: string, payload: unknown) {
    const response = (await invoke(envelope(method, payload))) as {
      status?: string;
      result?: unknown;
    };
    if (response?.status !== "ok") {
      throw new Error(`Mail engine ${method} failed`);
    }
    return response.result as never;
  }

  const observation: ObservationContext = {
    envelope,
    requestId,
    handles,
    push: createPushRouter(options.push),
  };

  return {
    observeMailbox: (query) =>
      observeSnapshot(observation, "observeMailbox", () => query),
    observeMailboxWindow: (query) => observeMailboxWindow(observation, query),
    observeConversation: (key, page) =>
      observeSnapshot(observation, "observeConversation", () => ({
        key,
        after: page.after,
        pageSize: page.pageSize,
      })),
    observeOperation: (key) =>
      observeSnapshot(observation, "observeOperation", () => key),
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
        ...(options.provider ? { provider: options.provider } : {}),
      }),
    ensureMessageContent: (key) => call("ensureMessageContent", key),
    getDiagnostics: (accountId) => call("getDiagnostics", { accountId }),
    purgeAccount: (accountId) => call("purgeAccount", { accountId }),
    inspect: () => call("inspect", {}),
    async close() {
      for (const handle of [...handles]) handle.close();
      observation.push.close();
    },
  };
}

export type MailIpcSnapshotEvent = {
  subscriptionId: string;
  snapshot: unknown;
};

export type MailIpcPushTransport = {
  subscribe(input: {
    subscriptionId: string;
    request: unknown;
  }): Promise<unknown>;
  unsubscribe(subscriptionId: string): Promise<unknown>;
  onSnapshot(listener: (event: MailIpcSnapshotEvent) => void): () => void;
};

type ObservationContext = {
  envelope: (method: string, payload: unknown) => unknown;
  requestId: () => string;
  handles: Set<{ close(): void }>;
  push: ReturnType<typeof createPushRouter>;
};

function observeSnapshot<T>(
  context: ObservationContext,
  method: string,
  payload: () => unknown,
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
  let publishedPayload: string | null = null;

  // Engine recovery and resubscribes can resend the snapshot already held.
  // Republishing it would re-render every subscriber.
  const accept = (requestKey: string, next: QuerySnapshot<T>) => {
    if (closed) return;
    if (requestKey === publishedPayload && sameSnapshot(snapshot, next)) return;
    publishedPayload = requestKey;
    snapshot = next;
    for (const listener of listeners) listener();
  };
  const fail = () => {
    if (closed) return;
    snapshot = {
      status: "error",
      revision: snapshot.revision,
      data: snapshot.data,
      refreshing: false,
      error: { code: "unavailable", retryable: true },
    };
    for (const listener of listeners) listener();
  };

  const source = pushSource(context, method, payload, accept, fail);

  const handle: RefreshableQueryHandle<T> = {
    refresh: source.refresh,
    getSnapshot: () => snapshot,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    close: () => {
      closed = true;
      listeners.clear();
      source.close();
      context.handles.delete(handle);
    },
  };
  context.handles.add(handle);
  return handle;
}

type SnapshotSource = { refresh(): Promise<void>; close(): void };

function pushSource<T>(
  context: ObservationContext,
  method: string,
  payload: () => unknown,
  accept: (requestKey: string, next: QuerySnapshot<T>) => void,
  fail: () => void,
): SnapshotSource {
  const router = context.push;
  let closed = false;
  let subscriptionId: string | null = null;
  let settlePending: (() => void) | null = null;

  // A changed payload (loadMore) replaces the subscription; the promise
  // settles once the host delivers its first snapshot, or when it is
  // replaced or closed first.
  const refresh = () => {
    if (closed) return Promise.resolve();
    const previous = subscriptionId;
    settlePending?.();
    const request = payload();
    const requestKey = JSON.stringify(request);
    const id = context.requestId();
    subscriptionId = id;
    if (previous) router.unsubscribe(previous);
    return new Promise<void>((resolve) => {
      settlePending = resolve;
      router.subscribe(
        id,
        context.envelope(method, request),
        (next) => {
          if (id !== subscriptionId) return;
          accept(requestKey, next as QuerySnapshot<T>);
          resolve();
        },
        () => {
          if (id === subscriptionId) fail();
          resolve();
        },
      );
    });
  };

  refresh().catch(() => undefined);
  return {
    refresh,
    close() {
      closed = true;
      settlePending?.();
      settlePending = null;
      if (subscriptionId) router.unsubscribe(subscriptionId);
      subscriptionId = null;
    },
  };
}

function createPushRouter(transport: MailIpcPushTransport) {
  const routes = new Map<string, (snapshot: unknown) => void>();
  const stopListening = transport.onSnapshot((event) => {
    routes.get(event.subscriptionId)?.(event.snapshot);
  });
  return {
    subscribe(
      subscriptionId: string,
      request: unknown,
      onSnapshot: (snapshot: unknown) => void,
      onError: () => void,
    ) {
      // Routed before subscribing so the host's first snapshot is never lost.
      routes.set(subscriptionId, onSnapshot);
      transport
        .subscribe({ subscriptionId, request })
        .then((response) => {
          if ((response as { status?: string })?.status !== "ok") onError();
        })
        .catch(onError);
    },
    unsubscribe(subscriptionId: string) {
      routes.delete(subscriptionId);
      transport.unsubscribe(subscriptionId).catch(() => undefined);
    },
    close() {
      routes.clear();
      stopListening();
    },
  };
}

function observeMailboxWindow(
  context: ObservationContext,
  query: Parameters<MailClient["observeMailbox"]>[0],
): MailboxWindowHandle {
  let pageCount = 1;
  const handle = observeSnapshot(context, "observeMailboxWindow", () => ({
    query,
    pageCount,
  })) as RefreshableQueryHandle<MailboxView> & MailboxWindowHandle;
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

function sameSnapshot<T>(left: QuerySnapshot<T>, right: QuerySnapshot<T>) {
  return (
    left.status === right.status &&
    left.refreshing === right.refreshing &&
    (left.error?.code ?? null) === (right.error?.code ?? null) &&
    left.revision !== null &&
    right.revision !== null &&
    revisionEquals(left.revision, right.revision)
  );
}
