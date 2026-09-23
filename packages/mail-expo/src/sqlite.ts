import type {
  SqlRow,
  SqlTransaction,
  SqlValue,
  SqliteDriver,
} from "@inboxzero/mail-sqlite/driver";

const CLOSED = "sqlite driver is closed";

type ExpoStatement = {
  executeAsync(params?: readonly SqlValue[]): Promise<{
    changes: number;
    getAllAsync(): Promise<Record<string, unknown>[]>;
  }>;
  finalizeAsync(): Promise<void>;
};

type ExpoDatabase = {
  execAsync(source: string): Promise<void>;
  prepareAsync(source: string): Promise<ExpoStatement>;
  withExclusiveTransactionAsync(
    task: (txn: ExpoDatabase) => Promise<void>,
  ): Promise<void>;
  withTransactionAsync(task: () => Promise<void>): Promise<void>;
  closeAsync(): Promise<void>;
};

type SqliteModule = {
  openDatabaseAsync(
    databaseName: string,
    options?: {
      useNewConnection?: boolean;
      finalizeUnusedStatementsBeforeClosing?: boolean;
    },
    directory?: string,
  ): Promise<ExpoDatabase>;
  deleteDatabaseAsync(databaseName: string, directory?: string): Promise<void>;
};

export async function createExpoSqliteDriver(input: {
  databaseName: string;
  directory?: string;
}): Promise<SqliteDriver> {
  const sqlite = (await import("expo-sqlite")) as unknown as SqliteModule;
  const open = () =>
    sqlite.openDatabaseAsync(
      input.databaseName,
      {
        useNewConnection: true,
        // Expo's default finalizes FTS5's own statements, then sqlite3_close
        // finalizes them again and crashes.
        finalizeUnusedStatementsBeforeClosing: false,
      },
      input.directory,
    );
  let database: ExpoDatabase;
  try {
    database = await open();
    await configureDatabase(database);
    await database.execAsync("SELECT name FROM sqlite_master LIMIT 1");
  } catch (error) {
    if (database!) await database.closeAsync().catch(() => undefined);
    if (!isCorruptSqliteError(error)) throw error;
    await sqlite.deleteDatabaseAsync(input.databaseName, input.directory);
    database = await open();
    await configureDatabase(database);
  }
  return createSerializedDriver(database!);
}

export function createSerializedDriver(database: ExpoDatabase): SqliteDriver {
  let chain = Promise.resolve();
  let closed = false;
  let exclusiveSupported = true;

  function enqueue<T>(work: () => Promise<T>): Promise<T> {
    if (closed) return Promise.reject(new Error(CLOSED));
    const run = chain.then(work);
    chain = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  async function inTransaction<T>(
    work: (tx: SqlTransaction) => Promise<T>,
  ): Promise<T> {
    const outcome: {
      current: { ok: true; value: T } | { ok: false; error: unknown } | null;
    } = { current: null };
    const task = async (txn: ExpoDatabase) => {
      await txn.execAsync("PRAGMA foreign_keys=ON");
      await txn.execAsync("PRAGMA busy_timeout=5000");
      try {
        outcome.current = {
          ok: true,
          value: await work(createTransaction(txn)),
        };
      } catch (error) {
        outcome.current = { ok: false, error };
        throw error;
      }
    };
    try {
      if (exclusiveSupported) {
        try {
          await database.withExclusiveTransactionAsync(task);
        } catch (error) {
          if (outcome || !isUnsupportedTransaction(error)) throw error;
          exclusiveSupported = false;
          await database.withTransactionAsync(() => task(database));
        }
      } else {
        await database.withTransactionAsync(() => task(database));
      }
    } catch (error) {
      if (outcome.current && !outcome.current.ok) throw outcome.current.error;
      throw error;
    }
    if (!outcome.current?.ok) {
      throw outcome.current?.ok === false
        ? outcome.current.error
        : new Error("sqlite transaction produced no result");
    }
    return outcome.current.value;
  }

  return {
    read: (work) => enqueue(() => inTransaction(work)),
    write: (work) => enqueue(() => inTransaction(work)),
    async close() {
      if (closed) return;
      closed = true;
      await chain;
      await database.closeAsync();
    },
  };
}

async function configureDatabase(database: ExpoDatabase) {
  await database.execAsync("PRAGMA foreign_keys=ON");
  await database.execAsync("PRAGMA journal_mode=WAL");
  await database.execAsync("PRAGMA synchronous=NORMAL");
  await database.execAsync("PRAGMA busy_timeout=5000");
}

function createTransaction(database: ExpoDatabase): SqlTransaction {
  return {
    exec(sql) {
      return database.execAsync(sql);
    },
    async query(sql, bindings = []) {
      const statement = await database.prepareAsync(sql);
      try {
        const result = await statement.executeAsync(bindings);
        const rows = await result.getAllAsync();
        return rows.map(normalizeRow);
      } finally {
        await statement.finalizeAsync();
      }
    },
    async execute(sql, bindings = []) {
      const statement = await database.prepareAsync(sql);
      try {
        const result = await statement.executeAsync(bindings);
        await result.getAllAsync().catch(() => undefined);
        return { changedRows: Number(result.changes ?? 0) };
      } finally {
        await statement.finalizeAsync();
      }
    },
  };
}

function normalizeRow(row: Record<string, unknown>): SqlRow {
  const normalized: SqlRow = {};
  for (const [key, value] of Object.entries(row)) {
    normalized[key] = normalizeValue(value);
  }
  return normalized;
}

function normalizeValue(value: unknown): SqlValue {
  if (value == null) return null;
  if (typeof value === "string" || typeof value === "number") return value;
  if (typeof value === "bigint") return Number(value);
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  throw new Error("SQLite returned an unsupported value");
}

function isCorruptSqliteError(error: unknown): boolean {
  const message = (
    error instanceof Error ? error.message : String(error)
  ).toLowerCase();
  return (
    message.includes("not a database") ||
    message.includes("malformed") ||
    message.includes("corrupt") ||
    message.includes("file is encrypted")
  );
}

function isUnsupportedTransaction(error: unknown): boolean {
  const message = (
    error instanceof Error ? error.message : String(error)
  ).toLowerCase();
  return message.includes("not supported") || message.includes("web");
}
