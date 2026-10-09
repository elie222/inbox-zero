import type { SqliteDriver } from "./driver";
import { clearSearchIndex } from "./message-search-index";

export async function evictReplaceableMessageContent(
  driver: SqliteDriver,
): Promise<{ evictedBodies: number }> {
  return driver.write(async (tx) => {
    const before = await tx.query("SELECT COUNT(*) AS n FROM message_content");
    const evictedBodies = Number(before[0]?.n ?? 0);
    if (evictedBodies === 0) return { evictedBodies: 0 };
    await tx.execute("DELETE FROM message_content");
    await clearSearchIndex(tx);
    await tx.execute(
      `UPDATE coverage SET content = 'partial', indexed_content = 'partial'`,
    );
    await tx.execute(
      "UPDATE profile_state SET sequence = sequence + 1 WHERE id = 1",
    );
    return { evictedBodies };
  });
}
