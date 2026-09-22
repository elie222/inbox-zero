import type { LocalRevision } from "@inboxzero/mail-core/identities";
import type { MessageMetadata } from "@inboxzero/mail-core/messages";
import type {
  ConversationQuery,
  MailboxView,
} from "@inboxzero/mail-core/queries";
import type { SqlTransaction } from "./driver";
import { compilePredicate } from "./queries";
import {
  connectionStatus,
  jsonStringArray,
  readCoverage,
  readRevision,
  uniqueStrings,
  worstConnection,
} from "./store-read-utils";

export async function readMailboxViewFromSql(
  tx: SqlTransaction,
  query: ConversationQuery,
): Promise<{ revision: LocalRevision; view: MailboxView }> {
  const revision = await readRevision(tx);
  const { rows, matching, unread } =
    query.predicate.kind === "role" && query.predicate.role === "inbox"
      ? await readIndexedRolePage(tx, query, query.predicate.role)
      : await readFilteredPage(tx, query);
  const page = rows.slice(0, query.pageSize);
  const summaries = [];
  for (const row of page) {
    const latest = await tx.query(
      `SELECT * FROM effective_messages
       WHERE account_id = ? AND conversation_id = ?
       ORDER BY received_at_ms DESC, message_id DESC LIMIT 1`,
      [row.account_id, row.conversation_id],
    );
    const message = latest[0];
    if (!message)
      throw new Error("Conversation query has no effective message");
    const members = await tx.query(
      `SELECT from_address, to_json, label_ids_json, roles_json FROM effective_messages
       WHERE account_id = ? AND conversation_id = ?
       ORDER BY received_at_ms ASC, message_id ASC`,
      [row.account_id, row.conversation_id],
    );
    summaries.push({
      key: {
        accountId: String(row.account_id),
        conversationId: String(row.conversation_id),
      },
      subject: String(message.subject),
      preview: String(message.preview),
      from: String(message.from_address),
      to: jsonStringArray(message.to_json).join(", "),
      senders: members
        .map((member) => String(member.from_address))
        .filter(Boolean),
      latestMessageAtMs: Number(row.latest),
      unread: Number(row.unread) === 1,
      starred: Number(row.starred) === 1,
      labelIds: uniqueStrings(
        members.flatMap((member) => jsonStringArray(member.label_ids_json)),
      ),
      roles: uniqueStrings(
        members.flatMap((member) => jsonStringArray(member.roles_json)),
      ) as MessageMetadata["roles"],
      pendingOperationIds: jsonStringArray(message.pending_operation_ids_json),
    });
  }
  const coverage = await readCoverage(tx, query.accountIds);
  const complete = coverage.every((item) => item.metadata === "complete");
  const accountConnections = await tx.query(
    `SELECT connection FROM accounts WHERE account_id IN (${query.accountIds.map(() => "?").join(",")})`,
    query.accountIds,
  );
  return {
    revision,
    view: {
      conversations: summaries,
      counts: {
        matchingConversations: Number(matching[0]?.n ?? 0),
        unreadConversations: Number(unread[0]?.n ?? 0),
        extent: complete ? "complete_scope" : "local_coverage",
      },
      nextPage:
        rows.length > query.pageSize
          ? `${page.at(-1)?.latest}\t${page.at(-1)?.account_id}\t${page.at(-1)?.conversation_id}`
          : null,
      coverage,
      connection: worstConnection(
        accountConnections.map((row) => connectionStatus(row.connection)),
      ),
    },
  };
}

export async function readMailboxWindowFromSql(
  tx: SqlTransaction,
  query: ConversationQuery,
  pageCount: number,
): Promise<{ revision: LocalRevision; view: MailboxView }> {
  const pages = Math.max(1, Math.trunc(pageCount));
  return readMailboxViewFromSql(tx, {
    ...query,
    pageSize: query.pageSize * pages,
  });
}

async function readFilteredPage(tx: SqlTransaction, query: ConversationQuery) {
  const compiled = compilePredicate(query.predicate);
  const accountPlaceholders = query.accountIds.map(() => "?").join(",");
  const where = `e.account_id IN (${accountPlaceholders}) AND ${compiled.sql}`;
  const bindings = [...query.accountIds, ...compiled.bindings];
  const cursor = query.after ? parseMailboxCursor(query.after) : null;
  const cursorSql = cursor
    ? `WHERE latest < ?
       OR (latest = ? AND account_id > ?)
       OR (latest = ? AND account_id = ? AND conversation_id > ?)`
    : "";
  const rows = await tx.query(
    `WITH grouped AS (
       SELECT e.account_id, e.conversation_id, MAX(e.received_at_ms) AS latest,
              MAX(CASE WHEN e.read = 0 THEN 1 ELSE 0 END) AS unread,
              MAX(e.starred) AS starred
       FROM effective_messages e
       WHERE ${where}
       GROUP BY e.account_id, e.conversation_id
     )
     SELECT * FROM grouped
     ${cursorSql}
     ORDER BY latest DESC, account_id ASC, conversation_id ASC
     LIMIT ?`,
    [
      ...bindings,
      ...(cursor
        ? [
            cursor.latest,
            cursor.latest,
            cursor.accountId,
            cursor.latest,
            cursor.accountId,
            cursor.conversationId,
          ]
        : []),
      query.pageSize + 1,
    ],
  );
  const matching = await tx.query(
    `SELECT COUNT(*) AS n FROM (
       SELECT 1 FROM effective_messages e WHERE ${where} GROUP BY e.account_id, e.conversation_id
     )`,
    bindings,
  );
  const unread = await tx.query(
    `SELECT COUNT(*) AS n FROM (
       SELECT 1 FROM effective_messages e
       WHERE ${where} AND e.read = 0
       GROUP BY e.account_id, e.conversation_id
     )`,
    bindings,
  );
  return { rows, matching, unread };
}

async function readIndexedRolePage(
  tx: SqlTransaction,
  query: ConversationQuery,
  role: MessageMetadata["roles"][number],
) {
  const accountPlaceholders = query.accountIds.map(() => "?").join(",");
  const cursor = query.after ? parseMailboxCursor(query.after) : null;
  const cursorSql = cursor
    ? `AND (
         c.latest_at_ms < ?
         OR (c.latest_at_ms = ? AND c.account_id > ?)
         OR (c.latest_at_ms = ? AND c.account_id = ? AND c.conversation_id > ?)
       )`
    : "";
  const rows = await tx.query(
    `SELECT c.account_id, c.conversation_id, c.latest_at_ms AS latest, c.unread, c.starred
     FROM effective_role_conversations c
     WHERE c.account_id IN (${accountPlaceholders}) AND c.role = ?
       ${cursorSql}
     ORDER BY c.latest_at_ms DESC, c.account_id ASC, c.conversation_id ASC
     LIMIT ?`,
    [
      ...query.accountIds,
      role,
      ...(cursor
        ? [
            cursor.latest,
            cursor.latest,
            cursor.accountId,
            cursor.latest,
            cursor.accountId,
            cursor.conversationId,
          ]
        : []),
      query.pageSize + 1,
    ],
  );
  const matching = await tx.query(
    `SELECT COUNT(*) AS n FROM effective_role_conversations
     WHERE account_id IN (${accountPlaceholders}) AND role = ?`,
    [...query.accountIds, role],
  );
  const unread = await tx.query(
    `SELECT COUNT(*) AS n FROM effective_role_conversations
     WHERE account_id IN (${accountPlaceholders}) AND role = ? AND unread = 1`,
    [...query.accountIds, role],
  );
  return { rows, matching, unread };
}

function parseMailboxCursor(value: string) {
  const [latest, accountId, conversationId] = value.split("\t");
  const latestMs = Number(latest);
  if (!Number.isFinite(latestMs) || !accountId || !conversationId) {
    return null;
  }
  return { latest: latestMs, accountId, conversationId };
}
