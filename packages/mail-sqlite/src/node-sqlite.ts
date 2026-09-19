import { rename, rm, stat } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import type { SqlTransaction, SqlValue, SqliteDriver } from "./driver";

export function createNodeSqliteDriver(path = ":memory:"): SqliteDriver {
  const database = new DatabaseSync(path);
  try {
    database.exec("PRAGMA foreign_keys=ON");
    if (path !== ":memory:") {
      database.exec("PRAGMA journal_mode=WAL");
      database.exec("PRAGMA synchronous=NORMAL");
    }
  } catch (error) {
    database.close();
    throw error;
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

export async function openOrQuarantineNodeMailbox(path: string): Promise<{
  driver: SqliteDriver;
  quarantinedPaths: string[];
}> {
  if (path === ":memory:") {
    return { driver: createNodeSqliteDriver(path), quarantinedPaths: [] };
  }
  let driver: SqliteDriver | null = null;
  try {
    driver = createNodeSqliteDriver(path);
    await assertReadableMailbox(driver);
    return { driver, quarantinedPaths: [] };
  } catch (error) {
    if (driver) {
      await driver.close().catch(() => undefined);
    }
    if (!isCorruptSqliteError(error)) throw error;
    const quarantinedPaths = await quarantineMailboxFiles(path);
    return {
      driver: createNodeSqliteDriver(path),
      quarantinedPaths,
    };
  }
}

export async function wipeNodeMailbox(path: string): Promise<void> {
  if (path === ":memory:") return;
  await Promise.all(
    mailboxSidecars(path).map((file) => rm(file, { force: true })),
  );
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

async function assertReadableMailbox(driver: SqliteDriver): Promise<void> {
  await driver.read((tx) => tx.query("SELECT name FROM sqlite_master LIMIT 1"));
}

async function quarantineMailboxFiles(path: string): Promise<string[]> {
  const stamp = Date.now();
  const moved: string[] = [];
  for (const source of mailboxSidecars(path)) {
    if (!(await pathExists(source))) continue;
    const destination = `${source}.corrupt-${stamp}`;
    await rename(source, destination);
    moved.push(destination);
  }
  return moved;
}

function mailboxSidecars(path: string): string[] {
  return [path, `${path}-wal`, `${path}-shm`];
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

function isCorruptSqliteError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const errcode = "errcode" in error ? Number(error.errcode) : Number.NaN;
  const message = "message" in error ? String(error.message).toLowerCase() : "";
  return (
    errcode === 11 ||
    errcode === 26 ||
    message.includes("not a database") ||
    message.includes("database disk image is malformed") ||
    message.includes("file is encrypted or is not a database")
  );
}
