import type { SqliteDriver } from "../src/driver";
import {
  probeSqliteCapabilities,
  type SqliteCapabilities,
} from "../src/capabilities";

export type DriverContractHost = {
  open(): Promise<SqliteDriver>;
};

export type DriverCapabilities = SqliteCapabilities;

export type DriverContractReport = {
  capabilities: DriverCapabilities;
};

export async function runSqliteDriverContract(
  host: DriverContractHost,
): Promise<DriverContractReport> {
  const driver = await host.open();
  try {
    await assertCommitAndRollback(driver);
    await assertSerializedWrites(driver);
    await assertTransactionalReadConsistency(driver);
    await assertParametersAndBlobs(driver);
    const capabilities = await probeSqliteCapabilities(driver);
    if (!capabilities.savepoints) {
      throw new Error("SQLite savepoints are required for mailbox migrations");
    }
    await assertSavepoints(driver);
    await assertCloseWaitsForQueuedWork(driver);
  } finally {
    await driver.close().catch(() => undefined);
  }

  await assertCloseAndReopen(host);
  const reopened = await host.open();
  try {
    const capabilities = await probeSqliteCapabilities(reopened);
    return { capabilities };
  } finally {
    await reopened.close().catch(() => undefined);
  }
}

/** Probe JSON, FTS5, and savepoint support. Savepoints are required for migrations. */
export { probeSqliteCapabilities };

async function assertCommitAndRollback(driver: SqliteDriver) {
  await driver.write(async (tx) => {
    await tx.exec(
      "CREATE TABLE IF NOT EXISTS items(id INTEGER PRIMARY KEY, name TEXT NOT NULL)",
    );
    await tx.execute("DELETE FROM items");
    await tx.execute("INSERT INTO items(name) VALUES (?)", ["alpha"]);
  });
  const rows = await driver.read((tx) => tx.query("SELECT name FROM items"));
  if (rows.length !== 1 || String(rows[0]?.name) !== "alpha") {
    throw new Error("expected committed row");
  }
  try {
    await driver.write(async (tx) => {
      await tx.execute("INSERT INTO items(name) VALUES (?)", ["beta"]);
      throw new Error("boom");
    });
  } catch (error) {
    if (!(error instanceof Error) || error.message !== "boom") throw error;
  }
  const afterRollback = await driver.read((tx) =>
    tx.query("SELECT name FROM items"),
  );
  if (afterRollback.length !== 1) throw new Error("rollback lost isolation");
}

async function assertSerializedWrites(driver: SqliteDriver) {
  const order: number[] = [];
  await Promise.all([
    driver.write(async (tx) => {
      await tx.execute("INSERT INTO items(name) VALUES (?)", ["one"]);
      order.push(1);
    }),
    driver.write(async (tx) => {
      await tx.execute("INSERT INTO items(name) VALUES (?)", ["two"]);
      order.push(2);
    }),
  ]);
  if (order.length !== 2) throw new Error("serialized writes did not complete");
  const rows = await driver.read((tx) =>
    tx.query("SELECT name FROM items ORDER BY id"),
  );
  if (rows.length < 3) throw new Error("serialized writes lost a row");
}

async function assertTransactionalReadConsistency(driver: SqliteDriver) {
  const counts: number[] = [];
  const read = driver.read(async (tx) => {
    const before = await tx.query("SELECT COUNT(*) AS n FROM items");
    await new Promise((resolve) => setTimeout(resolve, 20));
    const after = await tx.query("SELECT COUNT(*) AS n FROM items");
    counts.push(Number(before[0]?.n ?? 0), Number(after[0]?.n ?? 0));
  });
  const write = driver.write(async (tx) => {
    await tx.execute("INSERT INTO items(name) VALUES (?)", ["later"]);
  });
  await Promise.all([read, write]);
  if (counts.length !== 2 || counts[0] !== counts[1]) {
    throw new Error("read transaction was not consistent");
  }
}

async function assertParametersAndBlobs(driver: SqliteDriver) {
  await driver.write(async (tx) => {
    await tx.exec(
      "CREATE TABLE IF NOT EXISTS blobs(id INTEGER PRIMARY KEY, payload BLOB NOT NULL)",
    );
    await tx.execute("INSERT INTO blobs(payload) VALUES (?)", [
      new Uint8Array([0, 1, 2, 255]),
    ]);
  });
  const rows = await driver.read((tx) =>
    tx.query("SELECT payload FROM blobs ORDER BY id DESC LIMIT 1"),
  );
  const payload = rows[0]?.payload;
  const bytes = asBytes(payload);
  if (bytes?.length !== 4 || bytes[3] !== 255) {
    throw new Error("driver did not round-trip binary parameters");
  }
}

async function assertSavepoints(driver: SqliteDriver) {
  await driver.write(async (tx) => {
    await tx.execute("INSERT INTO items(name) VALUES (?)", ["keep"]);
    await tx.exec("SAVEPOINT driver_contract_inner");
    await tx.execute("INSERT INTO items(name) VALUES (?)", ["discard"]);
    await tx.exec("ROLLBACK TO driver_contract_inner");
    await tx.exec("RELEASE driver_contract_inner");
  });
  const discarded = await driver.read((tx) =>
    tx.query("SELECT name FROM items WHERE name = ?", ["discard"]),
  );
  if (discarded.length !== 0) {
    throw new Error("savepoint rollback leaked a row");
  }
}

async function assertCloseWaitsForQueuedWork(driver: SqliteDriver) {
  let finished = false;
  const write = driver.write(async (tx) => {
    await tx.execute("INSERT INTO items(name) VALUES (?)", ["queued-close"]);
    finished = true;
  });
  await driver.close();
  await write;
  if (!finished) throw new Error("close returned before queued work finished");
}

async function assertCloseAndReopen(host: DriverContractHost) {
  const first = await host.open();
  await first.write(async (tx) => {
    await tx.exec(
      "CREATE TABLE IF NOT EXISTS persist(id INTEGER PRIMARY KEY, name TEXT NOT NULL)",
    );
    await tx.execute("INSERT INTO persist(name) VALUES (?)", ["reopen"]);
  });
  await first.close();
  const second = await host.open();
  try {
    const rows = await second.read((tx) =>
      tx.query("SELECT name FROM persist WHERE name = ?", ["reopen"]),
    );
    if (rows.length !== 1) {
      throw new Error("reopened driver lost committed rows");
    }
  } finally {
    await second.close();
  }
}

function asBytes(value: unknown): Uint8Array | null {
  if (typeof value !== "object" || value === null) return null;
  if (value instanceof Uint8Array) return value;
  if (
    typeof ArrayBuffer !== "undefined" &&
    Object.getPrototypeOf(value) === ArrayBuffer.prototype
  ) {
    return new Uint8Array(value as ArrayBuffer);
  }
  return null;
}
