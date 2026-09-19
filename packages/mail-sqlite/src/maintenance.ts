import type { SqliteDriver } from "./driver";

export async function evictReplaceableMessageContent(
  driver: SqliteDriver,
): Promise<{ evictedBodies: number }> {
  return driver.write(async (tx) => {
    const before = await tx.query("SELECT COUNT(*) AS n FROM message_content");
    await tx.execute("DELETE FROM message_content");
    try {
      await tx.execute("DELETE FROM message_fts");
    } catch {
      // FTS is optional when the runtime SQLite build omits it.
    }
    await tx.execute(
      `UPDATE coverage SET content = 'partial', indexed_content = 'partial'`,
    );
    await tx.execute(
      "UPDATE profile_state SET sequence = sequence + 1 WHERE id = 1",
    );
    return { evictedBodies: Number(before[0]?.n ?? 0) };
  });
}
