import { DatabaseSync } from "node:sqlite";
import type { SqlTransaction, SqlValue, SqliteDriver } from "./driver";

export function createNodeSqliteDriver(path = ":memory:"): SqliteDriver {
  const database = new DatabaseSync(path);
  database.exec("PRAGMA foreign_keys=ON");
  if (path !== ":memory:") {
    database.exec("PRAGMA journal_mode=WAL");
    database.exec("PRAGMA synchronous=NORMAL");
  }
  let chain = Promise.resolve();
  let closed = false;

  function runExclusive<T>(
    work: (tx: SqlTransaction) => Promise<T>,
    write: boolean,
  ) {
    if (closed) return Promise.reject(new Error("sqlite driver is closed"));
    const run = chain.then(async () => {
      if (write) database.exec("BEGIN IMMEDIATE");
      else database.exec("BEGIN");
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
      database.close();
    },
  };
}

function createTransaction(database: DatabaseSync): SqlTransaction {
  return {
    async exec(sql) {
      database.exec(sql);
    },
    async query(sql, bindings = []) {
      const statement = database.prepare(sql);
      const rows = statement.all(...bindings) as Array<
        Record<string, SqlValue>
      >;
      return rows;
    },
    async execute(sql, bindings = []) {
      const statement = database.prepare(sql);
      const result = statement.run(...bindings) as { changes?: number };
      return { changedRows: Number(result.changes ?? 0) };
    },
  };
}
