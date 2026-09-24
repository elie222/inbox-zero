import { useCallback, useMemo, useRef, useSyncExternalStore } from "react";
import type {
  MailClient,
  MailboxWindowHandle,
} from "@inboxzero/mail-core/engine";
import {
  canonicalizeQuery,
  type ConversationQuery,
  type MailboxView,
  type QueryHandle,
  type QuerySnapshot,
} from "@inboxzero/mail-core/queries";
import { useOptionalMailClient } from "./MailEngineProvider";

export type MailboxWindowSnapshot = QuerySnapshot<MailboxView> & {
  canLoadMore: boolean;
  isLoadingMore: boolean;
  loadMore: () => Promise<void>;
};

type LoadableMailboxHandle = QueryHandle<MailboxView> & {
  loadMore?: MailboxWindowHandle["loadMore"];
};

type MailboxWindowStoreState = QuerySnapshot<MailboxView> & {
  canLoadMore: boolean;
  isLoadingMore: boolean;
};

export function useMailboxWindow(
  query: ConversationQuery,
  options: { client?: MailClient | null; enabled?: boolean } = {},
): MailboxWindowSnapshot {
  const contextClient = useOptionalMailClient();
  const client = options.client ?? contextClient;
  const enabled = options.enabled ?? true;
  const queryKey = canonicalizeQuery(query);
  const stableQueryRef = useRef({ key: queryKey, query });
  if (stableQueryRef.current.key !== queryKey) {
    stableQueryRef.current = { key: queryKey, query };
  }
  const stableQuery = stableQueryRef.current.query;
  const initialSnapshot = useMemo(
    () =>
      enabled && client
        ? loadingSnapshot()
        : readySnapshot(emptyMailboxView(stableQuery.accountIds)),
    [client, enabled, stableQuery.accountIds],
  );
  const createHandle = useCallback(
    () =>
      client && enabled
        ? observeMailboxWindow(client, stableQuery)
        : staticMailboxHandle(emptyMailboxView(stableQuery.accountIds)),
    [client, enabled, stableQuery],
  );
  const store = useMemo(
    () => createMailboxWindowStore(createHandle, initialSnapshot),
    [createHandle, initialSnapshot],
  );
  const snapshot = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getSnapshot,
  );
  const loadMore = useCallback(() => store.loadMore(), [store]);
  return { ...snapshot, loadMore };
}

function createMailboxWindowStore(
  createHandle: () => LoadableMailboxHandle,
  initialSnapshot: QuerySnapshot<MailboxView>,
) {
  let handle: LoadableMailboxHandle | null = null;
  let unsubscribeHandle: (() => void) | null = null;
  let isLoadingMore = false;
  let snapshot = withWindowState(initialSnapshot, null, isLoadingMore);
  const listeners = new Set<() => void>();

  const notify = () => {
    snapshot = withWindowState(
      handle?.getSnapshot() ?? initialSnapshot,
      handle,
      isLoadingMore,
    );
    for (const listener of listeners) listener();
  };

  return {
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) {
      listeners.add(listener);
      if (!handle) {
        snapshot = withWindowState(initialSnapshot, null, false);
        handle = createHandle();
        unsubscribeHandle = handle.subscribe(notify);
        notify();
      }
      return () => {
        listeners.delete(listener);
        if (listeners.size > 0) return;
        unsubscribeHandle?.();
        unsubscribeHandle = null;
        handle?.close();
        handle = null;
        isLoadingMore = false;
        snapshot = withWindowState(initialSnapshot, null, false);
      };
    },
    async loadMore() {
      const currentHandle = handle;
      const loadMore = currentHandle?.loadMore;
      if (
        !loadMore ||
        isLoadingMore ||
        !currentHandle.getSnapshot().data?.nextPage
      ) {
        return;
      }
      isLoadingMore = true;
      notify();
      try {
        await loadMore();
      } catch {
        // The handle snapshot reports query errors. Keep the UI responsive here.
      } finally {
        if (handle === currentHandle) {
          isLoadingMore = false;
          notify();
        }
      }
    },
  };
}

function observeMailboxWindow(
  client: MailClient,
  query: ConversationQuery,
): LoadableMailboxHandle {
  return client.observeMailboxWindow?.(query) ?? client.observeMailbox(query);
}

function withWindowState(
  snapshot: QuerySnapshot<MailboxView>,
  handle: LoadableMailboxHandle | null,
  isLoadingMore: boolean,
): MailboxWindowStoreState {
  return {
    ...snapshot,
    canLoadMore: Boolean(handle?.loadMore && snapshot.data?.nextPage),
    isLoadingMore,
  };
}

function staticMailboxHandle(view: MailboxView): QueryHandle<MailboxView> {
  const snapshot = readySnapshot(view);
  return {
    getSnapshot: () => snapshot,
    subscribe: () => () => undefined,
    close: () => undefined,
  };
}

function loadingSnapshot(): QuerySnapshot<MailboxView> {
  return {
    status: "loading",
    revision: null,
    data: null,
    refreshing: true,
    error: null,
  };
}

function readySnapshot(view: MailboxView): QuerySnapshot<MailboxView> {
  return {
    status: "ready",
    revision: null,
    data: view,
    refreshing: false,
    error: null,
  };
}

function emptyMailboxView(accountIds: string[]): MailboxView {
  return {
    conversations: [],
    counts: {
      matchingConversations: 0,
      unreadConversations: 0,
      extent: "local_coverage",
    },
    nextPage: null,
    coverage: accountIds.map((accountId) => ({
      accountId,
      scopeId: "account",
      metadata: "partial",
      content: "not_requested",
      indexedContent: "not_requested",
      lastCompletedSyncAtMs: null,
    })),
    connection: "ready",
  };
}
