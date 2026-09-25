import type { LocalRevision } from "@inboxzero/mail-core/identities";
import type { MessageMetadata } from "@inboxzero/mail-core/messages";
import type {
  ConversationQuery,
  MailboxCountsQuery,
  MailboxCountsView,
  MailboxView,
  MailPredicate,
  WellKnownMailbox,
} from "@inboxzero/mail-core/queries";
import type { SqlTransaction, SqlValue } from "./driver";
import { compilePredicate, type SearchSupport } from "./queries";
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
  search: SearchSupport,
): Promise<{ revision: LocalRevision; view: MailboxView }> {
  const revision = await readRevision(tx);
  const index = conversationIndexFor(query.predicate);
  const rows = index
    ? await readIndexedRows(tx, query, index)
    : await readFilteredRows(tx, { ...query, search });
  const { matching, unread } = await readCounts(
    tx,
    { ...query, search },
    index,
  );
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
        matchingConversations: matching,
        unreadConversations: unread,
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

export async function readMailboxCountsFromSql(
  tx: SqlTransaction,
  query: MailboxCountsQuery,
  search: SearchSupport,
): Promise<{ revision: LocalRevision; view: MailboxCountsView }> {
  const revision = await readRevision(tx);
  const counts: MailboxCountsView["counts"] = [];
  for (const target of query.targets) {
    const { matching, unread } = await readCounts(
      tx,
      { accountIds: query.accountIds, predicate: target.predicate, search },
      conversationIndexFor(target.predicate),
    );
    counts.push({
      id: target.id,
      matchingConversations: matching,
      unreadConversations: unread,
    });
  }
  return { revision, view: { counts } };
}

export const MAX_MAILBOX_WINDOW_PAGES = 40;

export async function readMailboxWindowFromSql(
  tx: SqlTransaction,
  query: ConversationQuery,
  pageCount: number,
  search: SearchSupport,
): Promise<{ revision: LocalRevision; view: MailboxView }> {
  const pages = Math.min(
    MAX_MAILBOX_WINDOW_PAGES,
    Math.max(1, Math.trunc(pageCount)),
  );
  const first = await readMailboxViewFromSql(tx, query, search);
  if (pages === 1) return first;
  const conversations = [...first.view.conversations];
  let after = first.view.nextPage;
  for (let page = 1; page < pages && after; page += 1) {
    const next = await readMailboxViewFromSql(tx, { ...query, after }, search);
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

type CountScope = {
  accountIds: string[];
  predicate: MailPredicate;
  search: SearchSupport;
};

type Counts = { matching: number; unread: number };

function readCounts(
  tx: SqlTransaction,
  scope: CountScope,
  index: ConversationIndex | null,
): Promise<Counts> {
  return index
    ? readIndexedCounts(tx, scope, index)
    : readFilteredCounts(tx, scope);
}

function filteredScope(scope: CountScope) {
  const mailbox =
    scope.predicate.kind === "mailbox" ? scope.predicate.mailbox : null;
  const compiled =
    mailbox === "archive" || mailbox === "all" || mailbox === "snoozed"
      ? { sql: "1=1", bindings: [] as SqlValue[] }
      : compilePredicate(scope.predicate, scope.search);
  const accountPlaceholders = scope.accountIds.map(() => "?").join(",");
  const where = `e.account_id IN (${accountPlaceholders}) AND ${compiled.sql}`;
  const bindings = [...scope.accountIds, ...compiled.bindings];
  const having = mailboxConversationHaving(mailbox);
  const groupedBindings = [...bindings, ...having.bindings];
  return { mailbox, where, having, groupedBindings };
}

async function readFilteredRows(
  tx: SqlTransaction,
  query: ConversationQuery & CountScope,
) {
  const { where, having, groupedBindings } = filteredScope(query);
  const cursor = query.after ? parseMailboxCursor(query.after) : null;
  const cursorSql = cursor
    ? `WHERE latest < ?
       OR (latest = ? AND account_id > ?)
       OR (latest = ? AND account_id = ? AND conversation_id > ?)`
    : "";
  return tx.query(
    `WITH grouped AS (
       SELECT e.account_id, e.conversation_id, MAX(e.received_at_ms) AS latest,
              MAX(CASE WHEN e.read = 0 THEN 1 ELSE 0 END) AS unread,
              MAX(e.starred) AS starred
       FROM effective_messages e
       WHERE ${where}
       GROUP BY e.account_id, e.conversation_id
       ${having.sql ? `HAVING ${having.sql}` : ""}
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
}

async function readFilteredCounts(
  tx: SqlTransaction,
  scope: CountScope,
): Promise<Counts> {
  const { mailbox, where, having, groupedBindings } = filteredScope(scope);
  const matching = await tx.query(
    `SELECT COUNT(*) AS n FROM (
       SELECT 1 FROM effective_messages e WHERE ${where}
       GROUP BY e.account_id, e.conversation_id
       ${having.sql ? `HAVING ${having.sql}` : ""}
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
  return {
    matching: Number(matching[0]?.n ?? 0),
    unread: Number(unread[0]?.n ?? 0),
  };
}

function mailboxConversationHaving(mailbox: WellKnownMailbox | null): {
  sql: string;
  bindings: SqlValue[];
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
  sourceBindings: SqlValue[];
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

async function readIndexedRows(
  tx: SqlTransaction,
  query: ConversationQuery,
  index: ConversationIndex,
) {
  const { where, whereBindings } = indexedScope(query, index);
  const cursor = query.after ? parseMailboxCursor(query.after) : null;
  const cursorSql = cursor
    ? `AND (
         c.latest_at_ms < ?
         OR (c.latest_at_ms = ? AND c.account_id > ?)
         OR (c.latest_at_ms = ? AND c.account_id = ? AND c.conversation_id > ?)
       )`
    : "";
  return tx.query(
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
}

async function readIndexedCounts(
  tx: SqlTransaction,
  scope: CountScope,
  index: ConversationIndex,
): Promise<Counts> {
  const { where, whereBindings } = indexedScope(scope, index);
  const [row] = await tx.query(
    `SELECT COUNT(*) AS n, COALESCE(SUM(c.unread = 1), 0) AS u
     FROM ${index.source} c WHERE ${where}`,
    whereBindings,
  );
  return { matching: Number(row?.n ?? 0), unread: Number(row?.u ?? 0) };
}

function indexedScope(
  scope: { accountIds: string[] },
  index: ConversationIndex,
) {
  const accountPlaceholders = scope.accountIds.map(() => "?").join(",");
  return {
    where: `c.account_id IN (${accountPlaceholders})`,
    whereBindings: [...index.sourceBindings, ...scope.accountIds],
  };
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
  page: Array<Record<string, SqlValue>>,
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
