import { blobIdSchema } from "@inboxzero/mail-core/identities";
import { PENDING_EFFECT_STATUSES } from "@inboxzero/mail-core/operations";
import type { SqliteDriver } from "./driver";

export async function evictReplaceableMessageContent(
  driver: SqliteDriver,
): Promise<{ evictedBodies: number }> {
  return driver.write(async (tx) => {
    const before = await tx.query("SELECT COUNT(*) AS n FROM message_content");
    const evictedBodies = Number(before[0]?.n ?? 0);
    if (evictedBodies === 0) return { evictedBodies: 0 };
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
    return { evictedBodies };
  });
}

export async function listReferencedBlobIds(
  driver: SqliteDriver,
): Promise<string[]> {
  // Terminal sends are omitted: frozen drafts still name attachment ids after
  // success. Confirmed send deletes those staged files; there is no mtime sweep.
  return driver.read(async (tx) => {
    const ids = new Set<string>();
    const drafts = await tx.query("SELECT content_json FROM drafts");
    for (const row of drafts) {
      for (const blobId of attachmentIdsFromJson(row.content_json)) {
        ids.add(blobId);
      }
    }
    const pending = ["preparing", ...PENDING_EFFECT_STATUSES];
    const operations = await tx.query(
      `SELECT payload_json, executable_payload_json FROM operations
       WHERE status IN (${pending.map(() => "?").join(",")})`,
      pending,
    );
    for (const row of operations) {
      for (const blobId of attachmentIdsFromJson(row.payload_json)) {
        ids.add(blobId);
      }
      for (const blobId of attachmentIdsFromJson(row.executable_payload_json)) {
        ids.add(blobId);
      }
    }
    return [...ids];
  });
}

function attachmentIdsFromJson(value: import("./driver").SqlValue) {
  if (value == null) return [];
  try {
    const parsed = JSON.parse(String(value)) as { attachmentIds?: unknown };
    if (!Array.isArray(parsed.attachmentIds)) return [];
    return parsed.attachmentIds.filter(
      (id): id is string =>
        typeof id === "string" && blobIdSchema.safeParse(id).success,
    );
  } catch {
    return [];
  }
}
