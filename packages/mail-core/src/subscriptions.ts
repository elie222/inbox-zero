import {
  canonicalizeQuery,
  type ConversationQuery,
  type MailboxView,
  type QueryHandle,
  type QuerySnapshot,
} from "./queries";
import type { LocalRevision } from "./identities";

export function createQueryRegistry() {
  const handles = new Map<string, Set<MutableHandle<unknown>>>();

  return {
    observe<T>(
      key: string,
      load: () => Promise<{ revision: LocalRevision; data: T }>,
    ): QueryHandle<T> {
      const handle = createHandle<T>(async () => {
        try {
          const loaded = await load();
          handle.publish({
            status: "ready",
            revision: loaded.revision,
            data: loaded.data,
            refreshing: false,
            error: null,
          });
        } catch {
          handle.publish({
            status: "error",
            revision: handle.getSnapshot().revision,
            data: handle.getSnapshot().data,
            refreshing: false,
            error: { code: "unavailable", retryable: true },
          });
        }
      });
      let group = handles.get(key);
      if (!group) {
        group = new Set();
        handles.set(key, group);
      }
      group.add(handle as MutableHandle<unknown>);
      handle.refresh().catch(() => undefined);
      return {
        getSnapshot: () => handle.getSnapshot(),
        subscribe: (listener) => handle.subscribe(listener),
        close: () => {
          handle.close();
          group?.delete(handle as MutableHandle<unknown>);
          if (group && group.size === 0) handles.delete(key);
        },
      };
    },
    async refreshAll() {
      await Promise.all(
        [...handles.values()].flatMap((group) =>
          [...group].map((handle) => handle.refresh()),
        ),
      );
    },
    closeAll() {
      for (const group of handles.values()) {
        for (const handle of group) handle.close();
      }
      handles.clear();
    },
  };
}

export function mailboxQueryKey(query: ConversationQuery): string {
  return canonicalizeQuery(query);
}

type MutableHandle<T> = {
  getSnapshot(): QuerySnapshot<T>;
  publish(snapshot: QuerySnapshot<T>): void;
  subscribe(listener: () => void): () => void;
  refresh(): Promise<void>;
  close(): void;
};

function createHandle<T>(load: () => Promise<void>): MutableHandle<T> {
  let snapshot: QuerySnapshot<T> = {
    status: "loading",
    revision: null,
    data: null,
    refreshing: true,
    error: null,
  };
  const listeners = new Set<() => void>();
  let closed = false;
  return {
    getSnapshot() {
      return snapshot;
    },
    publish(next) {
      if (closed) return;
      snapshot = next;
      for (const listener of listeners) listener();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async refresh() {
      if (closed) return;
      snapshot = { ...snapshot, refreshing: true };
      for (const listener of listeners) listener();
      await load();
    },
    close() {
      closed = true;
      listeners.clear();
    },
  };
}

export type { MailboxView };
