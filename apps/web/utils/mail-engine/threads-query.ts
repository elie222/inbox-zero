import type {
  ConversationQuery,
  MailPredicate,
} from "@inboxzero/mail-core/queries";
import type { ThreadsQuery } from "@/utils/threads/validation";

export function threadsQueryToConversationQuery(input: {
  accountIds: string[];
  query: ThreadsQuery;
  pageSize?: number;
  after?: string | null;
}): ConversationQuery {
  return {
    accountIds: input.accountIds,
    predicate: threadsQueryToPredicate(input.query),
    order: "newest_first",
    pageSize: input.pageSize ?? 50,
    after: input.after ?? null,
  };
}

export function threadsQueryToPredicate(query: ThreadsQuery): MailPredicate {
  const clauses: MailPredicate[] = [];
  if (query.q) {
    clauses.push(...textQueryPredicates(query.q));
  }
  if (query.type === "unread") {
    clauses.push({ kind: "role", role: "inbox" });
    clauses.push({ kind: "read", value: false });
  } else if (
    query.type === "inbox" ||
    query.type === "sent" ||
    query.type === "draft" ||
    query.type === "trash" ||
    query.type === "spam"
  ) {
    clauses.push({ kind: "role", role: query.type });
  } else if (query.type?.startsWith("CATEGORY_")) {
    clauses.push({
      kind: "membership",
      membership: "category",
      id: query.type,
    });
  } else if (!query.q && !query.labelId && !query.folderId) {
    clauses.push({ kind: "role", role: "inbox" });
  }
  if (query.isUnread) clauses.push({ kind: "read", value: false });
  if (query.fromEmail) {
    clauses.push({
      kind: "address",
      field: "from",
      value: query.fromEmail,
      match: "address",
    });
  }
  if (query.labelId) {
    clauses.push({
      kind: "membership",
      membership: "label",
      id: query.labelId,
    });
  }
  if (query.folderId) {
    clauses.push({
      kind: "membership",
      membership: "folder",
      id: query.folderId,
    });
  }
  if (query.after || query.before) {
    clauses.push({
      kind: "received",
      afterMs: query.after ? query.after.getTime() : null,
      beforeMs: query.before ? query.before.getTime() : null,
    });
  }
  if (query.anyOf?.length) {
    clauses.push({
      kind: "any",
      predicates: query.anyOf.map(leafToPredicate),
    });
  }
  if (query.excludeSplits?.length) {
    clauses.push({
      kind: "not",
      predicate: {
        kind: "any",
        predicates: query.excludeSplits.map((split) => ({
          kind: split.matchAll ? "all" : "any",
          predicates: split.filters.map((filter) =>
            filter.kind === "UNREAD"
              ? { kind: "read" as const, value: false }
              : filter.kind === "FROM" && filter.value
                ? {
                    kind: "address" as const,
                    field: "from" as const,
                    value: filter.value,
                    match: "address" as const,
                  }
                : {
                    kind: "membership" as const,
                    membership: "label" as const,
                    id: filter.value ?? "",
                  },
          ),
        })),
      },
    });
  }
  if (clauses.length === 0) return { kind: "role", role: "inbox" };
  if (clauses.length === 1) return clauses[0];
  return { kind: "all", predicates: clauses };
}

function leafToPredicate(leaf: {
  labelId?: string | null;
  fromEmail?: string | null;
  isUnread?: true | null;
}): MailPredicate {
  if (leaf.labelId) {
    return { kind: "membership", membership: "label", id: leaf.labelId };
  }
  if (leaf.fromEmail) {
    return {
      kind: "address",
      field: "from",
      value: leaf.fromEmail,
      match: "address",
    };
  }
  return { kind: "read", value: false };
}

function textQueryPredicates(query: string): MailPredicate[] {
  const clauses: MailPredicate[] = [];
  let remaining = query.trim();
  remaining = takePrefixedValue(remaining, "subject:", (value) => {
    clauses.push({
      kind: "text",
      field: "subject",
      value,
      match: "phrase",
    });
  });
  remaining = takePrefixedValue(remaining, "from:", (value) => {
    clauses.push({
      kind: "address",
      field: "from",
      value,
      match: "address",
    });
  });
  remaining = takeToken(remaining, "has:attachment", () => {
    clauses.push({ kind: "has_attachment", value: true });
  });
  remaining = remaining.replaceAll(/\s+/g, " ").trim();
  if (remaining) {
    clauses.push({
      kind: "text",
      field: "any",
      value: remaining,
      match: "phrase",
    });
  }
  return clauses;
}

function takePrefixedValue(
  input: string,
  prefix: string,
  onValue: (value: string) => void,
) {
  const at = findStandaloneToken(input, prefix);
  if (at === -1) return input;
  const valueStart = at + prefix.length;
  if (input[valueStart] === '"') {
    const closing = input.indexOf('"', valueStart + 1);
    if (closing === -1) return input;
    const value = input.slice(valueStart + 1, closing);
    if (!value) return input;
    onValue(value);
    return `${input.slice(0, at)} ${input.slice(closing + 1)}`;
  }
  const space = input.indexOf(" ", valueStart);
  const valueEnd = space === -1 ? input.length : space;
  const value = input.slice(valueStart, valueEnd);
  if (!value) return input;
  onValue(value);
  return `${input.slice(0, at)} ${input.slice(valueEnd)}`;
}

function takeToken(input: string, token: string, onMatch: () => void) {
  const at = findStandaloneToken(input, token);
  if (at === -1) return input;
  onMatch();
  return `${input.slice(0, at)} ${input.slice(at + token.length)}`;
}

function findStandaloneToken(input: string, token: string) {
  const haystack = input.toLowerCase();
  const needle = token.toLowerCase();
  let start = 0;
  while (start <= haystack.length - needle.length) {
    const at = haystack.indexOf(needle, start);
    if (at === -1) return -1;
    const before = at === 0 ? " " : input[at - 1];
    if (before === " " || before === "(") return at;
    start = at + 1;
  }
  return -1;
}
