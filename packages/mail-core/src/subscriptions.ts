import {
  canonicalizeQuery,
  type ConversationQuery,
  type QueryHandle,
  type QuerySnapshot,
} from "./queries";
import { revisionEquals, type LocalRevision } from "./identities";

export function createQueryRegistry() {
  const groups = new Map<string, QueryGroup<unknown>>();

  return {
    observe<T>(
      key: string,
      load: () => Promise<{ revision: LocalRevision; data: T }>,
    ): QueryHandle<T> {
      let group = groups.get(key) as QueryGroup<T> | undefined;
      if (!group) {
        group = createGroup(load, () => {
          if (group && group.handles.size === 0) groups.delete(key);
        });
        groups.set(key, group as QueryGroup<unknown>);
      }
      return group.observe();
    },
    async refreshKey(key: string) {
      await groups.get(key)?.refresh();
    },
    async refreshPrefix(prefix: string) {
      await Promise.all(
        [...groups.entries()]
          .filter(([key]) => key.startsWith(prefix))
          .map(([, group]) => group.refresh()),
      );
    },
    async refreshAll() {
      await Promise.all([...groups.values()].map((group) => group.refresh()));
    },
    closeAll() {
      for (const group of groups.values()) group.close();
      groups.clear();
    },
  };
}

export function mailboxQueryKey(query: ConversationQuery): string {
  return `mailbox:${canonicalizeQuery(query)}`;
}

type QueryGroup<T> = {
  handles: Set<MutableHandle<T>>;
  observe(): QueryHandle<T>;
  refresh(): Promise<void>;
  close(): void;
};

type MutableHandle<T> = {
  getSnapshot(): QuerySnapshot<T>;
  publish(snapshot: QuerySnapshot<T>): void;
  subscribe(listener: () => void): () => void;
  close(): void;
};

function createGroup<T>(
  load: () => Promise<{ revision: LocalRevision; data: T }>,
  onEmpty: () => void,
): QueryGroup<T> {
  const handles = new Set<MutableHandle<T>>();
  let latestRead = 0;
  let inFlight: Promise<void> | null = null;
  let queued = false;

  async function runLoad() {
    const read = ++latestRead;
    try {
      const loaded = await load();
      if (read !== latestRead) return;
      publishAll({
        status: "ready",
        revision: loaded.revision,
        data: loaded.data,
        refreshing: false,
        error: null,
      });
    } catch {
      if (read !== latestRead) return;
      for (const handle of handles) {
        const current = handle.getSnapshot();
        handle.publish({
          status: "error",
          revision: current.revision,
          data: current.data,
          refreshing: false,
          error: { code: "unavailable", retryable: true },
        });
      }
    }
  }

  function publishAll(snapshot: QuerySnapshot<T>) {
    for (const handle of handles) handle.publish(snapshot);
  }

  async function refresh() {
    if (handles.size === 0) return;
    queued = true;
    if (inFlight) return inFlight;
    inFlight = drainLoads().finally(() => {
      inFlight = null;
    });
    return inFlight;
  }

  async function drainLoads() {
    while (queued && handles.size > 0) {
      queued = false;
      for (const handle of handles) {
        const current = handle.getSnapshot();
        if (current.status === "loading" && !current.refreshing) {
          handle.publish({ ...current, refreshing: true });
        }
      }
      await runLoad();
    }
  }

  return {
    handles,
    observe() {
      const handle = createHandle<T>();
      handles.add(handle);
      refresh().catch(() => undefined);
      return {
        getSnapshot: () => handle.getSnapshot(),
        subscribe: (listener) => handle.subscribe(listener),
        close: () => {
          handle.close();
          handles.delete(handle);
          if (handles.size === 0) onEmpty();
        },
      };
    },
    refresh,
    close() {
      for (const handle of handles) handle.close();
      handles.clear();
    },
  };
}

function createHandle<T>(): MutableHandle<T> {
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
      if (snapshotEquals(snapshot, next)) return;
      snapshot = next;
      for (const listener of listeners) listener();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    close() {
      closed = true;
      listeners.clear();
    },
  };
}

function snapshotEquals<T>(left: QuerySnapshot<T>, right: QuerySnapshot<T>) {
  if (left.status !== right.status) return false;
  if (left.refreshing !== right.refreshing) return false;
  if ((left.error?.code ?? null) !== (right.error?.code ?? null)) return false;
  if (left.revision && right.revision) {
    return (
      revisionEquals(left.revision, right.revision) &&
      left.status === right.status
    );
  }
  return left.revision === right.revision && left.data === right.data;
}
