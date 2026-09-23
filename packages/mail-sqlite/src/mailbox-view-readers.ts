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
  const index = conversationIndexFor(query.predicate);
  const { rows, matching, unread } = index
    ? await readIndexedPage(tx, query, index)
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
  const unreadOnSnoozedMessage =
    mailbox === "snoozed" ? " AND IFNULL(e.snoozed_until_ms, 0) > ?" : "";
  const unreadHaving = having.sql
    ? `HAVING ${having.sql} AND MAX(CASE WHEN e.read = 0${unreadOnSnoozedMessage} THEN 1 ELSE 0 END) = 1`
    : "";
  const unread = await tx.query(
    `SELECT COUNT(*) AS n FROM (
       SELECT 1 FROM effective_messages e
       WHERE ${where}${having.sql ? "" : " AND e.read = 0"}
       GROUP BY e.account_id, e.conversation_id
       ${unreadHaving}
     )`,
    mailbox === "snoozed"
      ? [...groupedBindings, ...having.bindings]
      : groupedBindings,
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

type ConversationIndex = {
  source: string;
  sourceBindings: import("./driver").SqlValue[];
};

// Single-role and single-membership views read trigger-maintained indexes
// instead of scanning every message.
function conversationIndexFor(
  predicate: ConversationQuery["predicate"],
): ConversationIndex | null {
  if (predicate.kind === "role") return roleIndex(predicate.role);
  if (predicate.kind === "mailbox" && predicate.mailbox === "inbox") {
    return roleIndex("inbox");
  }
  if (predicate.kind === "membership") {
    const account = predicate.accountId ? " AND account_id = ?" : "";
    return {
      source: `(SELECT account_id, conversation_id, MAX(received_at_ms) AS latest_at_ms,
                       MAX(1 - read) AS unread, MAX(starred) AS starred
                FROM effective_message_memberships
                WHERE kind = ? AND membership_id = ?${account}
                GROUP BY account_id, conversation_id)`,
      sourceBindings: [
        predicate.membership,
        predicate.id,
        ...(predicate.accountId ? [predicate.accountId] : []),
      ],
    };
  }
  return null;
}

function roleIndex(role: MessageMetadata["roles"][number]): ConversationIndex {
  return {
    source:
      "(SELECT account_id, conversation_id, latest_at_ms, unread, starred FROM effective_role_conversations WHERE role = ?)",
    sourceBindings: [role],
  };
}

async function readIndexedPage(
  tx: SqlTransaction,
  query: ConversationQuery,
  index: ConversationIndex,
) {
  const accountPlaceholders = query.accountIds.map(() => "?").join(",");
  const where = `c.account_id IN (${accountPlaceholders})`;
  const whereBindings = [...index.sourceBindings, ...query.accountIds];
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
     FROM ${index.source} c
     WHERE ${where}
       ${cursorSql}
     ORDER BY c.latest_at_ms DESC, c.account_id ASC, c.conversation_id ASC
     LIMIT ?`,
    [
      ...whereBindings,
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
    `SELECT COUNT(*) AS n FROM ${index.source} c WHERE ${where}`,
    whereBindings,
  );
  const unread = await tx.query(
    `SELECT COUNT(*) AS n FROM ${index.source} c WHERE ${where} AND c.unread = 1`,
    whereBindings,
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
