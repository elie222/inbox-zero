import initSqlite, { type Database } from "@sqlite.org/sqlite-wasm";
import type {
  SqlTransaction,
  SqlValue,
  SqliteDriver,
} from "@inboxzero/mail-sqlite/driver";

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
      directory: ".mail-engine",
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
