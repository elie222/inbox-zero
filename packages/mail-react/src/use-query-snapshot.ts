import { useMemo, useSyncExternalStore } from "react";
import type { QueryHandle, QuerySnapshot } from "@inboxzero/mail-core/queries";

export function useQuerySnapshot<T>(
  createHandle: () => QueryHandle<T>,
): QuerySnapshot<T> {
  const store = useMemo(
    () => createQuerySnapshotStore(createHandle),
    [createHandle],
  );
  return useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getSnapshot,
  );
}

function createQuerySnapshotStore<T>(createHandle: () => QueryHandle<T>) {
  let handle: QueryHandle<T> | null = null;
  let unsubscribeHandle: (() => void) | null = null;
  let snapshot = loadingSnapshot<T>();
  const listeners = new Set<() => void>();
  const notify = () => {
    snapshot = handle?.getSnapshot() ?? loadingSnapshot<T>();
    for (const listener of listeners) listener();
  };

  return {
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) {
      listeners.add(listener);
      if (!handle) {
        snapshot = loadingSnapshot<T>();
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
        snapshot = loadingSnapshot<T>();
      };
    },
  };
}

function loadingSnapshot<T>(): QuerySnapshot<T> {
  return {
    status: "loading",
    revision: null,
    data: null,
    refreshing: true,
    error: null,
  };
}
