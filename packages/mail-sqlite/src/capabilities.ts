import type { SqlTransaction, SqliteDriver } from "./driver";

export type SqliteCapabilities = {
  jsonEach: boolean;
  jsonExtract: boolean;
  fts5: boolean;
  savepoints: boolean;
};

export async function probeSqliteCapabilities(
  driver: SqliteDriver,
): Promise<SqliteCapabilities> {
  return driver.read((tx) => probeSqliteCapabilitiesInTx(tx));
}

export async function probeSqliteCapabilitiesInTx(
  tx: SqlTransaction,
): Promise<SqliteCapabilities> {
  const jsonEach = await hasCapability(tx, "SELECT 1 FROM json_each('[1]')");
  const jsonExtract = await hasCapability(
    tx,
    "SELECT json_extract('{\"a\":1}', '$.a')",
  );
  const fts5 = await hasCapability(
    tx,
    "CREATE VIRTUAL TABLE IF NOT EXISTS temp.mail_capability_fts USING fts5(body)",
  );
  const savepoints = await hasCapability(tx, "SAVEPOINT mail_capability_probe");
  if (savepoints) {
    await tx.exec("RELEASE mail_capability_probe").catch(() => undefined);
  }
  return { jsonEach, jsonExtract, fts5, savepoints };
}

async function hasCapability(tx: SqlTransaction, sql: string) {
  try {
    await tx.exec(sql);
    return true;
  } catch {
    return false;
  }
}
