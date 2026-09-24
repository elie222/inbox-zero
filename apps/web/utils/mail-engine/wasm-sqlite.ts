import initSqlite, { type Database } from "@sqlite.org/sqlite-wasm";
import type {
  SqlTransaction,
  SqlValue,
  SqliteDriver,
} from "@inboxzero/mail-sqlite/driver";

export const MAIL_ENGINE_OPFS_DIRECTORY = ".mail-engine";

export async function createWasmSqliteDriver(input?: {
  name?: string;
  persist?: boolean;
}): Promise<SqliteDriver> {
  const sqlite = await initSqlite();
  const persist = input?.persist !== false && typeof navigator !== "undefined";
  let database: Database;
  let release: (() => Promise<void>) | undefined;
  if (
    persist &&
    "storage" in navigator &&
    "getDirectory" in navigator.storage
  ) {
    const pool = await sqlite.installOpfsSAHPoolVfs({
      name: input?.name ?? "mail-engine",
      directory: MAIL_ENGINE_OPFS_DIRECTORY,
      initialCapacity: 8,
    });
    await pool.unpauseVfs();
    database = new pool.OpfsSAHPoolDb("/mailbox.sqlite");
    release = async () => {
      database.close();
      await pool.pauseVfs();
    };
  } else {
    database = new sqlite.oo1.DB(":memory:");
    release = async () => {
      database.close();
    };
  }
  database.exec("PRAGMA foreign_keys=ON");
  let chain = Promise.resolve();
  let closed = false;

  function runExclusive<T>(
    work: (tx: SqlTransaction) => Promise<T>,
    write: boolean,
  ) {
    if (closed) return Promise.reject(new Error("sqlite driver is closed"));
    const run = chain.then(async () => {
      database.exec(write ? "BEGIN IMMEDIATE" : "BEGIN");
      const tx = createTransaction(database);
      try {
        const result = await work(tx);
        database.exec("COMMIT");
        return result;
      } catch (error) {
        try {
          database.exec("ROLLBACK");
        } catch {
          // already rolled back
        }
        throw error;
      }
    });
    chain = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  return {
    read: (work) => runExclusive(work, false),
    write: (work) => runExclusive(work, true),
    async close() {
      closed = true;
      await chain;
      await release?.();
    },
  };
}

function createTransaction(database: Database): SqlTransaction {
  return {
    async exec(sql) {
      database.exec(sql);
    },
    async query(sql, bindings = []) {
      const rows = database.exec({
        sql,
        bind: bindings as never,
        rowMode: "object",
        returnValue: "resultRows",
      }) as Array<Record<string, SqlValue>>;
      return rows ?? [];
    },
    async execute(sql, bindings = []) {
      database.exec({
        sql,
        bind: bindings as never,
      });
      const changed = Number(database.selectValue("SELECT changes()") ?? 0);
      return { changedRows: changed };
    },
  };
}

export async function wipeOpfsMailEngine() {
  if (
    typeof navigator === "undefined" ||
    !("storage" in navigator) ||
    !("getDirectory" in navigator.storage)
  ) {
    return;
  }
  let root: FileSystemDirectoryHandle;
  try {
    root = await navigator.storage.getDirectory();
  } catch {
    return;
  }
  for (let attempt = 0; attempt < 8; attempt++) {
    try {
      await root.removeEntry(MAIL_ENGINE_OPFS_DIRECTORY, { recursive: true });
      return;
    } catch (error) {
      if (isMissingOpfsEntry(error)) return;
      if (attempt === 7) return;
      await new Promise((resolve) => setTimeout(resolve, 25 * 2 ** attempt));
    }
  }
}

function isMissingOpfsEntry(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    error.name === "NotFoundError"
  );
}
