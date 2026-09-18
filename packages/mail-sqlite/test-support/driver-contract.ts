import { createNodeSqliteDriver } from "../src/node-sqlite";
import type { SqliteDriver } from "../src/driver";

export async function runDriverContract(driver: SqliteDriver) {
  await driver.write(async (tx) => {
    await tx.exec(
      "CREATE TABLE items(id INTEGER PRIMARY KEY, name TEXT NOT NULL)",
    );
    await tx.execute("INSERT INTO items(name) VALUES (?)", ["alpha"]);
  });
  const rows = await driver.read((tx) => tx.query("SELECT name FROM items"));
  if (rows.length !== 1) throw new Error("expected committed row");
  try {
    await driver.write(async (tx) => {
      await tx.execute("INSERT INTO items(name) VALUES (?)", ["beta"]);
      throw new Error("boom");
    });
  } catch {
    // expected
  }
  const afterRollback = await driver.read((tx) =>
    tx.query("SELECT name FROM items"),
  );
  if (afterRollback.length !== 1) throw new Error("rollback lost isolation");
  await driver.close();
}

export { createNodeSqliteDriver };
