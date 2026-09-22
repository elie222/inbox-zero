import type { LocalRevision } from "@inboxzero/mail-core/identities";
import type { MessageMetadata } from "@inboxzero/mail-core/messages";
import type {
  ConversationQuery,
  MailboxView,
  WellKnownMailbox,
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
      : query.predicate.kind === "mailbox" &&
          query.predicate.mailbox === "inbox"
        ? await readIndexedRolePage(tx, query, "inbox")
        : await readFilteredPage(tx, query);
  const page = rows.slice(0, query.pageSize);
  const summaries = await readConversationSummaries(tx, page);
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

export const MAX_MAILBOX_WINDOW_PAGES = 40;

export async function readMailboxWindowFromSql(
  tx: SqlTransaction,
  query: ConversationQuery,
  pageCount: number,
): Promise<{ revision: LocalRevision; view: MailboxView }> {
  const pages = Math.min(
    MAX_MAILBOX_WINDOW_PAGES,
    Math.max(1, Math.trunc(pageCount)),
  );
  const first = await readMailboxViewFromSql(tx, query);
  if (pages === 1) return first;
  const conversations = [...first.view.conversations];
  let after = first.view.nextPage;
  for (let page = 1; page < pages && after; page += 1) {
    const next = await readMailboxViewFromSql(tx, { ...query, after });
    conversations.push(...next.view.conversations);
    after = next.view.nextPage;
  }
  return {
    revision: first.revision,
    view: {
      ...first.view,
      conversations,
      nextPage: after,
    },
  };
}

async function readFilteredPage(tx: SqlTransaction, query: ConversationQuery) {
  const mailbox =
    query.predicate.kind === "mailbox" ? query.predicate.mailbox : null;
  const compiled =
    mailbox === "archive" || mailbox === "all" || mailbox === "snoozed"
      ? { sql: "1=1", bindings: [] as import("./driver").SqlValue[] }
      : compilePredicate(query.predicate);
  const accountPlaceholders = query.accountIds.map(() => "?").join(",");
  const where = `e.account_id IN (${accountPlaceholders}) AND ${compiled.sql}`;
  const bindings = [...query.accountIds, ...compiled.bindings];
  const having = mailboxConversationHaving(mailbox);
  const havingSql = having.sql ? `HAVING ${having.sql}` : "";
  const groupedBindings = [...bindings, ...having.bindings];
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
       ${havingSql}
     )
     SELECT * FROM grouped
     ${cursorSql}
     ORDER BY latest DESC, account_id ASC, conversation_id ASC
     LIMIT ?`,
    [
      ...groupedBindings,
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
       SELECT 1 FROM effective_messages e WHERE ${where}
       GROUP BY e.account_id, e.conversation_id
       ${havingSql}
     )`,
    groupedBindings,
  );
  const unreadHaving = having.sql
    ? `HAVING ${having.sql} AND MAX(CASE WHEN e.read = 0 THEN 1 ELSE 0 END) = 1`
    : "";
  const unread = await tx.query(
    `SELECT COUNT(*) AS n FROM (
       SELECT 1 FROM effective_messages e
       WHERE ${where}${having.sql ? "" : " AND e.read = 0"}
       GROUP BY e.account_id, e.conversation_id
       ${unreadHaving}
     )`,
    groupedBindings,
  );
  return { rows, matching, unread };
}

function mailboxConversationHaving(mailbox: WellKnownMailbox | null): {
  sql: string;
  bindings: import("./driver").SqlValue[];
} {
  if (mailbox === "archive") {
    return {
      sql: "MAX(e.in_inbox) = 0 AND MAX(e.in_trash) = 0 AND MAX(e.in_spam) = 0",
      bindings: [],
    };
  }
  if (mailbox === "all") {
    return {
      sql: "MAX(e.in_trash) = 0 AND MAX(e.in_spam) = 0",
      bindings: [],
    };
  }
  if (mailbox === "snoozed") {
    return {
      sql: "MAX(IFNULL(e.snoozed_until_ms, 0)) > ?",
      bindings: [Date.now()],
    };
  }
  return { sql: "", bindings: [] };
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

async function readConversationSummaries(
  tx: SqlTransaction,
  page: Array<Record<string, import("./driver").SqlValue>>,
) {
  if (page.length === 0) return [];
  const members = await tx.query(
    `SELECT account_id, conversation_id, message_id, subject, preview, from_address, to_json,
            received_at_ms, unread, starred, label_ids_json, roles_json, pending_operation_ids_json
     FROM (
       SELECT e.account_id, e.conversation_id, e.message_id, e.subject, e.preview, e.from_address,
              e.to_json, e.received_at_ms, e.read AS unread, e.starred, e.label_ids_json, e.roles_json,
              e.pending_operation_ids_json
       FROM effective_messages e
       WHERE ${page
         .map(() => "(e.account_id = ? AND e.conversation_id = ?)")
         .join(" OR ")}
     )`,
    page.flatMap((row) => [row.account_id, row.conversation_id]),
  );
  const grouped = new Map<string, typeof members>();
  for (const member of members) {
    const key = `${member.account_id}\0${member.conversation_id}`;
    const list = grouped.get(key) ?? [];
    list.push(member);
    grouped.set(key, list);
  }
  return page.map((row) => {
    const key = `${row.account_id}\0${row.conversation_id}`;
    const conversationMembers = [...(grouped.get(key) ?? [])].sort(
      (left, right) => {
        const byTime =
          Number(left.received_at_ms) - Number(right.received_at_ms);
        if (byTime !== 0) return byTime;
        return String(left.message_id).localeCompare(String(right.message_id));
      },
    );
    const message = conversationMembers.at(-1);
    if (!message)
      throw new Error("Conversation query has no effective message");
    return {
      key: {
        accountId: String(row.account_id),
        conversationId: String(row.conversation_id),
      },
      subject: String(message.subject),
      preview: String(message.preview),
      from: String(message.from_address),
      to: jsonStringArray(message.to_json).join(", "),
      senders: conversationMembers
        .map((member) => String(member.from_address))
        .filter(Boolean),
      latestMessageAtMs: Number(row.latest),
      unread: Number(row.unread) === 1,
      starred: Number(row.starred) === 1,
      labelIds: uniqueStrings(
        conversationMembers.flatMap((member) =>
          jsonStringArray(member.label_ids_json),
        ),
      ),
      roles: uniqueStrings(
        conversationMembers.flatMap((member) =>
          jsonStringArray(member.roles_json),
        ),
      ) as MessageMetadata["roles"],
      pendingOperationIds: jsonStringArray(message.pending_operation_ids_json),
    };
  });
}
