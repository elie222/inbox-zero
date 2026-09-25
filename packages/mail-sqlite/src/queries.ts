import type { MailPredicate } from "@inboxzero/mail-core/queries";
import type { SqlValue } from "./driver";
import { searchMatchQuery } from "./search-text";

export function compilePredicate(
  predicate: MailPredicate,
  search: SearchSupport,
  alias = "e",
): { sql: string; bindings: SqlValue[] } {
  switch (predicate.kind) {
    case "all": {
      if (predicate.predicates.length === 0)
        return { sql: "1=1", bindings: [] };
      const parts = predicate.predicates.map((child) =>
        compilePredicate(child, search, alias),
      );
      return {
        sql: `(${parts.map((part) => part.sql).join(" AND ")})`,
        bindings: parts.flatMap((part) => part.bindings),
      };
    }
    case "any": {
      if (predicate.predicates.length === 0)
        return { sql: "0=1", bindings: [] };
      const parts = predicate.predicates.map((child) =>
        compilePredicate(child, search, alias),
      );
      return {
        sql: `(${parts.map((part) => part.sql).join(" OR ")})`,
        bindings: parts.flatMap((part) => part.bindings),
      };
    }
    case "not": {
      const inner = compilePredicate(predicate.predicate, search, alias);
      return { sql: `(NOT ${inner.sql})`, bindings: inner.bindings };
    }
    case "role": {
      const column = {
        inbox: "in_inbox",
        sent: "in_sent",
        draft: "in_draft",
        trash: "in_trash",
        spam: "in_spam",
      }[predicate.role];
      return { sql: `${alias}.${column} = 1`, bindings: [] };
    }
    case "mailbox":
      return compileMailboxPredicate(predicate.mailbox, alias);
    case "read":
      return { sql: `${alias}.read = ?`, bindings: [predicate.value ? 1 : 0] };
    case "starred":
      return {
        sql: `${alias}.starred = ?`,
        bindings: [predicate.value ? 1 : 0],
      };
    case "inbox_section":
      return {
        sql: `${alias}.inbox_section = ?`,
        bindings: [predicate.section],
      };
    case "membership": {
      const accountSql = predicate.accountId
        ? `${alias}.account_id = ? AND `
        : "";
      const accountBindings: SqlValue[] = predicate.accountId
        ? [predicate.accountId]
        : [];
      if (predicate.membership === "folder") {
        return {
          sql: `(${accountSql}${alias}.folder_id = ?)`,
          bindings: [...accountBindings, predicate.id],
        };
      }
      if (predicate.membership === "label") {
        return {
          sql: `(${accountSql}EXISTS (SELECT 1 FROM json_each(${alias}.label_ids_json) WHERE value = ?))`,
          bindings: [...accountBindings, predicate.id],
        };
      }
      return {
        sql: `(${accountSql}EXISTS (SELECT 1 FROM json_each(${alias}.category_ids_json) WHERE value = ?))`,
        bindings: [...accountBindings, predicate.id],
      };
    }
    case "address": {
      const column =
        predicate.field === "from"
          ? `${alias}.from_address`
          : predicate.field === "to"
            ? `${alias}.to_json`
            : `${alias}.to_json`;
      if (predicate.field === "from" && predicate.match === "address") {
        return {
          sql: `(LOWER(${column}) = LOWER(?) OR LOWER(${column}) LIKE '%' || LOWER(?) || '%')`,
          bindings: [predicate.value, predicate.value],
        };
      }
      return {
        sql: `LOWER(${column}) LIKE '%' || LOWER(?) || '%'`,
        bindings: [predicate.value],
      };
    }
    case "received": {
      const parts: string[] = [];
      const bindings: SqlValue[] = [];
      if (predicate.afterMs !== null) {
        parts.push(`${alias}.received_at_ms >= ?`);
        bindings.push(predicate.afterMs);
      }
      if (predicate.beforeMs !== null) {
        parts.push(`${alias}.received_at_ms < ?`);
        bindings.push(predicate.beforeMs);
      }
      return {
        sql: parts.length ? `(${parts.join(" AND ")})` : "1=1",
        bindings,
      };
    }
    case "has_attachment":
      return {
        sql: `${alias}.has_attachments = ?`,
        bindings: [predicate.value ? 1 : 0],
      };
    case "text":
      return compileTextPredicate(predicate, search, alias);
    default: {
      const exhaustive: never = predicate;
      return exhaustive;
    }
  }
}

// `complete` means every message has a search row, so the index alone answers
// text predicates.
export type SearchSupport = { fts5: boolean; complete: boolean };

// When the index is complete and the predicate requires a text match, the
// query starts from the index hits and joins each to its message, so a search
// costs in proportion to its matches rather than to the mailbox. Resolves the
// source to select from and the rest of the predicate to filter it by.
export function searchDrivenSource(
  predicate: MailPredicate,
  search: SearchSupport,
): { from: string; bindings: SqlValue[]; rest: MailPredicate } | null {
  if (!search.fts5 || !search.complete) return null;
  const clauses = predicate.kind === "all" ? predicate.predicates : [predicate];
  for (const [index, clause] of clauses.entries()) {
    if (clause.kind !== "text") continue;
    const match = textMatchQuery(clause);
    if (!match) continue;
    return {
      from: `(SELECT k.account_id, k.message_id
            FROM message_fts CROSS JOIN message_fts_keys k ON k.fts_rowid = message_fts.rowid
            WHERE message_fts MATCH ?) hit
          CROSS JOIN effective_messages e
            ON e.account_id = hit.account_id AND e.message_id = hit.message_id`,
      bindings: [match],
      rest: {
        kind: "all",
        predicates: clauses.filter((_clause, position) => position !== index),
      },
    };
  }
  return null;
}

// Indexed messages are matched through message_fts. A message without a
// search row (metadata only, or waiting in the index backlog) is matched by
// substring over its small columns instead, so results are not silently
// missing while the backlog catches up. Stored bodies are compressed, so a
// body only becomes searchable once it is indexed.
function compileTextPredicate(
  predicate: Extract<MailPredicate, { kind: "text" }>,
  search: SearchSupport,
  alias: string,
): { sql: string; bindings: SqlValue[] } {
  const unindexed = compileUnindexedText(predicate, alias);
  if (!search.fts5) return unindexed;
  const match = textMatchQuery(predicate);
  if (!match) return { sql: "0=1", bindings: [] };
  // The MATCH subquery does not depend on the row, so SQLite builds its key
  // set once per statement and probes it for each candidate message; the
  // unindexed check only reads the keys' primary-key index.
  const indexed = `(${alias}.account_id, ${alias}.message_id) IN (
      SELECT k.account_id, k.message_id FROM message_fts_keys k
      WHERE k.fts_rowid IN (SELECT rowid FROM message_fts WHERE message_fts MATCH ?)
    )`;
  if (search.complete) return { sql: indexed, bindings: [match] };
  return {
    sql: `(${indexed}
      OR (
        NOT EXISTS (
          SELECT 1 FROM message_fts_keys k
          WHERE k.account_id = ${alias}.account_id AND k.message_id = ${alias}.message_id
        )
        AND ${unindexed.sql}
      ))`,
    bindings: [match, ...unindexed.bindings],
  };
}

function compileUnindexedText(
  predicate: Extract<MailPredicate, { kind: "text" }>,
  alias: string,
): { sql: string; bindings: SqlValue[] } {
  const words = predicate.value.split(/\s+/).filter(Boolean);
  const terms =
    predicate.match === "phrase" || words.length === 0
      ? [predicate.value]
      : words;
  const columns = {
    subject: [`${alias}.subject LIKE ? ESCAPE '\\'`],
    body: [],
    any: [
      `${alias}.subject LIKE ? ESCAPE '\\'`,
      `${alias}.preview LIKE ? ESCAPE '\\'`,
      `${alias}.from_address LIKE ? ESCAPE '\\'`,
    ],
  }[predicate.field];
  if (columns.length === 0) return { sql: "0=1", bindings: [] };
  return {
    sql: `(${terms.map(() => `(${columns.join(" OR ")})`).join(" AND ")})`,
    bindings: terms.flatMap((term) =>
      columns.map(() => `%${escapeLike(term)}%`),
    ),
  };
}

function compileMailboxPredicate(
  mailbox: Extract<MailPredicate, { kind: "mailbox" }>["mailbox"],
  alias: string,
): { sql: string; bindings: SqlValue[] } {
  switch (mailbox) {
    case "inbox":
      return { sql: `${alias}.in_inbox = 1`, bindings: [] };
    case "sent":
      return { sql: `${alias}.in_sent = 1`, bindings: [] };
    case "drafts":
      return { sql: `${alias}.in_draft = 1`, bindings: [] };
    case "trash":
      return { sql: `${alias}.in_trash = 1`, bindings: [] };
    case "spam":
      return { sql: `${alias}.in_spam = 1`, bindings: [] };
    case "starred":
      return { sql: `${alias}.starred = 1`, bindings: [] };
    case "archive":
      return {
        sql: `(${alias}.in_inbox = 0 AND ${alias}.in_trash = 0 AND ${alias}.in_spam = 0)`,
        bindings: [],
      };
    case "all":
      return {
        sql: `(${alias}.in_trash = 0 AND ${alias}.in_spam = 0)`,
        bindings: [],
      };
    case "snoozed":
      return {
        sql: `IFNULL(${alias}.snoozed_until_ms, 0) > ?`,
        bindings: [Date.now()],
      };
  }
}

function textMatchQuery(
  predicate: Extract<MailPredicate, { kind: "text" }>,
): string | null {
  const query = searchMatchQuery(predicate.value, predicate.match);
  if (!query) return null;
  return predicate.field === "any" ? query : `${predicate.field} : (${query})`;
}

function escapeLike(value: string): string {
  return value
    .replaceAll("\\", "\\\\")
    .replaceAll("%", "\\%")
    .replaceAll("_", "\\_");
}
