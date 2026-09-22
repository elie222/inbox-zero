import type { MailPredicate } from "@inboxzero/mail-core/queries";
import type { SqlValue } from "./driver";

export function compilePredicate(
  predicate: MailPredicate,
  alias = "e",
): { sql: string; bindings: SqlValue[] } {
  switch (predicate.kind) {
    case "all": {
      if (predicate.predicates.length === 0)
        return { sql: "1=1", bindings: [] };
      const parts = predicate.predicates.map((child) =>
        compilePredicate(child, alias),
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
        compilePredicate(child, alias),
      );
      return {
        sql: `(${parts.map((part) => part.sql).join(" OR ")})`,
        bindings: parts.flatMap((part) => part.bindings),
      };
    }
    case "not": {
      const inner = compilePredicate(predicate.predicate, alias);
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
    case "read":
      return { sql: `${alias}.read = ?`, bindings: [predicate.value ? 1 : 0] };
    case "starred":
      return {
        sql: `${alias}.starred = ?`,
        bindings: [predicate.value ? 1 : 0],
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
    case "text": {
      const like = `%${escapeLike(predicate.value)}%`;
      if (predicate.field === "subject") {
        return { sql: `${alias}.subject LIKE ? ESCAPE '\\'`, bindings: [like] };
      }
      if (predicate.field === "body") {
        return {
          sql: `EXISTS (SELECT 1 FROM message_content c WHERE c.account_id = ${alias}.account_id AND c.message_id = ${alias}.message_id AND (c.text LIKE ? ESCAPE '\\' OR c.html LIKE ? ESCAPE '\\'))`,
          bindings: [like, like],
        };
      }
      return {
        sql: `(${alias}.subject LIKE ? ESCAPE '\\' OR ${alias}.preview LIKE ? ESCAPE '\\' OR ${alias}.from_address LIKE ? ESCAPE '\\' OR EXISTS (SELECT 1 FROM message_content c WHERE c.account_id = ${alias}.account_id AND c.message_id = ${alias}.message_id AND (c.text LIKE ? ESCAPE '\\' OR c.html LIKE ? ESCAPE '\\')))`,
        bindings: [like, like, like, like, like],
      };
    }
    default: {
      const exhaustive: never = predicate;
      return exhaustive;
    }
  }
}

function escapeLike(value: string): string {
  return value
    .replaceAll("\\", "\\\\")
    .replaceAll("%", "\\%")
    .replaceAll("_", "\\_");
}
