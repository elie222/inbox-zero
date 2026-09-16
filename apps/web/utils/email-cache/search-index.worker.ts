import initSqlite from "@sqlite.org/sqlite-wasm";
import {
  evaluateLocalMailStorageAdmission,
  LocalMailStorageBusyError,
  withLocalMailStorageLock,
} from "./local-mail-storage";
import {
  createSearchIndex,
  SearchIndexCapacityError,
  type SearchIndexBatch,
  type SearchIndexQuery,
} from "./search-index";

type Index = ReturnType<typeof createSearchIndex>;
type IndexCommand =
  | {
      id: number;
      command: "reset";
      request: Parameters<Index["resetAccount"]>[0];
    }
  | {
      id: number;
      command: "deleteAccount";
      request: Parameters<Index["deleteAccount"]>[0];
    }
  | { id: number; command: "apply"; request: SearchIndexBatch }
  | { id: number; command: "search"; request: SearchIndexQuery }
  | { id: number; command: "state"; emailAccountId: string }
  | { id: number; command: "accounts"; after?: string }
  | {
      id: number;
      command: "replacementState";
      emailAccountId: string;
      threadId: string;
    }
  | { id: number; command: "storage" | "clearAll" };
export type SearchIndexRequest = IndexCommand & { storageBudgetBytes?: number };
export type SearchIndexResponse =
  | { id: number; result: ReturnType<Index[keyof Index]> }
  | {
      id: number;
      error: "unavailable" | "busy" | SearchIndexCapacityError["code"];
    };

// Only the cross-window storage owner may start this worker, including cleanup.
// The package's new URL(..., import.meta.url) resolves its bundled WASM asset.
let initialized: ReturnType<typeof initialize> | undefined;
let cleared = false;
let pending = Promise.resolve();
let queued = 0;
self.onmessage = ({ data }: MessageEvent<SearchIndexRequest>) => {
  if (queued >= 16) {
    self.postMessage({
      id: data.id,
      error: "busy",
    } satisfies SearchIndexResponse);
    return;
  }
  queued++;
  pending = pending.then(async () => {
    try {
      if (data.command === "clearAll") {
        cleared = true;
        const resource = await initialized;
        if (resource) {
          resource.database.close();
          await resource.pool.removeVfs();
        } else {
          // Logout cleanup does not initialize an index for assistant-only users.
          const root = await navigator.storage.getDirectory();
          try {
            await root.removeEntry(".mail-search", { recursive: true });
          } catch (error) {
            if (
              !(error instanceof DOMException && error.name === "NotFoundError")
            )
              throw error;
          }
        }
        self.postMessage({
          id: data.id,
          result: true,
        } satisfies SearchIndexResponse);
        return;
      }
      if (cleared) throw new Error("Local search worker closed");
      initialized ??= initialize();
      const resource = await initialized;
      if (!resource) throw new Error("Local search index unavailable");
      const index = resource.index;
      let result: ReturnType<Index[keyof Index]>;
      if (data.command === "reset") result = index.resetAccount(data.request);
      else if (data.command === "deleteAccount")
        result = index.deleteAccount(data.request);
      else if (data.command === "apply") {
        result = await withLocalMailStorageLock(async () => {
          const admission = evaluateLocalMailStorageAdmission({
            desktop: false,
            budgetBytes: data.storageBudgetBytes,
            estimate: await navigator.storage.estimate(),
            expectedGrowthBytes: 0,
          });
          if (admission.reason === "storage-unavailable")
            throw new Error("Local storage measurement unavailable");
          index.setStorageLimit(
            index.getStorageBytes() + Math.floor(admission.remainingBytes),
          );
          return index.applyBatch(data.request);
        });
      } else if (data.command === "search") result = index.search(data.request);
      else if (data.command === "state")
        result = index.getAccountState(data.emailAccountId);
      else if (data.command === "accounts")
        result = index.listAccounts(data.after);
      else if (data.command === "replacementState")
        result = index.getThreadReplacementState(
          data.emailAccountId,
          data.threadId,
        );
      else result = index.getStorageBytes();
      self.postMessage({ id: data.id, result } satisfies SearchIndexResponse);
    } catch (error) {
      // SQLite error text can contain mail content or a query; expose only codes.
      self.postMessage({
        id: data.id,
        error:
          error instanceof LocalMailStorageBusyError
            ? "busy"
            : error instanceof SearchIndexCapacityError
              ? error.code
              : isStorageFull(error)
                ? "storage-full"
                : "unavailable",
      } satisfies SearchIndexResponse);
    } finally {
      queued--;
    }
  });
};

function isStorageFull(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "resultCode" in error &&
    typeof error.resultCode === "number" &&
    (error.resultCode & 0xff) === 13
  );
}

async function initialize() {
  try {
    const sqlite = await initSqlite();
    const pool = await sqlite.installOpfsSAHPoolVfs({
      name: "mail-search",
      directory: ".mail-search",
      initialCapacity: 6,
    });
    const database = new pool.OpfsSAHPoolDb("/search.sqlite");
    try {
      return { index: createSearchIndex(database), database, pool };
    } catch (error) {
      database.close();
      pool.pauseVfs();
      throw error;
    }
  } catch {
    return null;
  }
}
