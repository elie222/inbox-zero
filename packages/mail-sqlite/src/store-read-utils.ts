import type { LocalRevision } from "@inboxzero/mail-core/identities";
import type { MessageMetadata } from "@inboxzero/mail-core/messages";
import type { Coverage } from "@inboxzero/mail-core/queries";
import type { SqlTransaction, SqlValue } from "./driver";

export type ConnectionStatus = "ready" | "offline" | "blocked_auth";

export async function readRevision(tx: SqlTransaction): Promise<LocalRevision> {
  const rows = await tx.query(
    "SELECT database_epoch, sequence FROM profile_state WHERE id = 1",
  );
  return {
    databaseEpoch: String(rows[0]?.database_epoch ?? ""),
    sequence: Number(rows[0]?.sequence ?? 0),
  };
}

export async function readCoverage(
  tx: SqlTransaction,
  accountIds: string[],
): Promise<Coverage[]> {
  if (accountIds.length === 0) return [];
  const rows = await tx.query(
    `SELECT * FROM coverage WHERE account_id IN (${accountIds.map(() => "?").join(",")})`,
    accountIds,
  );
  const coveredAccounts = new Set(rows.map((row) => String(row.account_id)));
  const missingAccounts: Coverage[] = accountIds
    .filter((accountId) => !coveredAccounts.has(accountId))
    .map((accountId) => ({
      accountId,
      scopeId: "primary",
      metadata: "partial",
      content: "not_requested",
      indexedContent: "not_requested",
      lastCompletedSyncAtMs: null,
    }));
  return [
    ...rows.map(
      (row): Coverage => ({
        accountId: String(row.account_id),
        scopeId: String(row.scope_id),
        metadata: String(row.metadata) as Coverage["metadata"],
        content: String(row.content) as Coverage["content"],
        indexedContent: String(
          row.indexed_content,
        ) as Coverage["indexedContent"],
        lastCompletedSyncAtMs:
          row.last_completed_sync_at_ms == null
            ? null
            : Number(row.last_completed_sync_at_ms),
      }),
    ),
    ...missingAccounts,
  ];
}

export function connectionStatus(value: unknown): ConnectionStatus {
  const connection = String(value ?? "ready");
  return connection === "blocked_auth" || connection === "offline"
    ? connection
    : "ready";
}

export function worstConnection(values: ConnectionStatus[]): ConnectionStatus {
  if (values.includes("blocked_auth")) return "blocked_auth";
  if (values.includes("offline")) return "offline";
  return "ready";
}

export function metadataFromEffective(
  row: Record<string, SqlValue>,
): MessageMetadata {
  return {
    subject: String(row.subject),
    preview: String(row.preview),
    from: String(row.from_address),
    to: JSON.parse(String(row.to_json)) as string[],
    cc: [],
    receivedAtMs: Number(row.received_at_ms),
    read: Number(row.read) === 1,
    starred: Number(row.starred) === 1,
    folderId: row.folder_id === null ? null : String(row.folder_id),
    labelIds: JSON.parse(String(row.label_ids_json)) as string[],
    categoryIds: JSON.parse(String(row.category_ids_json)) as string[],
    roles: JSON.parse(String(row.roles_json)) as MessageMetadata["roles"],
    hasAttachments: Number(row.has_attachments) === 1,
  };
}

export function jsonStringArray(value: SqlValue) {
  try {
    const parsed = JSON.parse(String(value)) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}

export function uniqueStrings(values: string[]) {
  return [...new Set(values)];
}
