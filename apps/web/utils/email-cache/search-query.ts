import { tokenizeSearchQuery } from "@/utils/mail/tokenize-search-query";
import type { EmailLabel } from "@/providers/email-label-types";
import type { ParsedMessage } from "@/utils/types";

type SearchTerm =
  | { field: "text" | "from" | "to" | "subject"; value: string }
  | { field: "label"; value: string }
  | { field: "after"; value: number }
  | { field: "before"; value: number };

/** `any` carries no constraint; it is what a corpus-widening operator parses to. */
export type SearchNode =
  | { type: "term"; term: SearchTerm }
  | { type: "any" }
  | { type: "not"; node: SearchNode }
  | { type: "and"; nodes: SearchNode[] }
  | { type: "or"; nodes: SearchNode[] };

type LocalSearchQuery = { node: SearchNode; includeSpamTrash: boolean };
type ParserState = {
  tokens: string[];
  position: number;
  labels: Pick<EmailLabel, "id" | "name">[];
  negated: boolean;
  includeSpamTrash: boolean;
};
export type SearchMessage = Pick<
  ParsedMessage,
  | "id"
  | "threadId"
  | "headers"
  | "subject"
  | "snippet"
  | "internalDate"
  | "labelIds"
> &
  Partial<Pick<ParsedMessage, "textPlain" | "date" | "parentFolderId">>;

export function parseLocalSearch(
  query: string,
  labels: Pick<EmailLabel, "id" | "name">[],
): LocalSearchQuery | undefined {
  if ((query.match(/"/g)?.length ?? 0) % 2) return;
  const tokens = tokenizeSearchQuery(query).flatMap(splitGroupingTokens);
  if (!tokens.length) return;
  const state: ParserState = {
    tokens,
    position: 0,
    labels,
    negated: false,
    includeSpamTrash: false,
  };
  const node = parseConjunction(state);
  if (!node || state.position < tokens.length) return;
  return { node, includeSpamTrash: state.includeSpamTrash };
}

export function matchesLocalSearch(
  message: SearchMessage,
  query: LocalSearchQuery,
) {
  if (
    !query.includeSpamTrash &&
    message.labelIds?.some((label) => label === "SPAM" || label === "TRASH")
  )
    return false;
  return matchesNode(message, query.node);
}

export function getNormalizedSearchText(
  message: SearchMessage,
  field: "text" | "from" | "to" | "subject",
) {
  const text =
    field === "text"
      ? [
          message.subject,
          message.snippet,
          message.headers.from,
          message.headers.to,
          message.headers.cc,
          message.headers.bcc,
          message.textPlain,
        ]
          .filter(Boolean)
          .join("\n")
      : field === "subject"
        ? message.subject
        : message.headers[field];
  return (text ?? "").normalize("NFKC").toLowerCase();
}

/** Grouping and negation are structural, so they are separated from the
 *  whitespace-and-quote tokens the provider query builders also consume. */
function splitGroupingTokens(token: string): string[] {
  const parts: string[] = [];
  let current = "";
  let quoted = false;
  for (const character of token) {
    if (character === '"') quoted = !quoted;
    if (!quoted && (character === "(" || character === ")")) {
      if (current) parts.push(current);
      parts.push(character);
      current = "";
      continue;
    }
    if (!quoted && character === "-" && !current) {
      parts.push("-");
      continue;
    }
    current += character;
  }
  if (current) parts.push(current);
  return parts;
}

// Adjacency means AND, and OR binds tighter than it, so `a b OR c` reads as
// `a AND (b OR c)`.
function parseConjunction(state: ParserState): SearchNode | undefined {
  const nodes: SearchNode[] = [];
  while (state.position < state.tokens.length) {
    if (state.tokens[state.position] === ")") break;
    if (state.tokens[state.position] === "AND") {
      if (!nodes.length) return;
      state.position++;
      if (
        state.position >= state.tokens.length ||
        state.tokens[state.position] === ")"
      )
        return;
      continue;
    }
    const node = parseDisjunction(state);
    if (!node) return;
    nodes.push(node);
  }
  if (!nodes.length) return;
  return nodes.length === 1 ? nodes[0] : { type: "and", nodes };
}

function parseDisjunction(state: ParserState): SearchNode | undefined {
  const first = parseUnary(state);
  if (!first) return;
  const nodes = [first];
  while (state.tokens[state.position] === "OR") {
    state.position++;
    const next = parseUnary(state);
    if (!next) return;
    nodes.push(next);
  }
  return nodes.length === 1 ? first : { type: "or", nodes };
}

function parseUnary(state: ParserState): SearchNode | undefined {
  const token = state.tokens[state.position];
  if (token === undefined || token === ")" || token === "OR" || token === "AND")
    return;
  if (token === "-") {
    state.position++;
    state.negated = !state.negated;
    const node = parseUnary(state);
    state.negated = !state.negated;
    return node && { type: "not", node };
  }
  if (token === "(") {
    state.position++;
    const node = parseConjunction(state);
    if (!node || state.tokens[state.position] !== ")") return;
    state.position++;
    return node;
  }
  state.position++;
  return parseTermNode(token, state);
}

function parseTermNode(
  token: string,
  state: ParserState,
): SearchNode | undefined {
  if (/^[-+]|[(){}*]|^(OR|AND|NOT)$/u.test(token)) return;
  const separator = token.indexOf(":");
  const field =
    separator < 0 ? "text" : token.slice(0, separator).toLowerCase();
  const raw = separator < 0 ? token : token.slice(separator + 1);
  if (!raw || (raw.includes('"') && !/^"[^"]+"$/u.test(raw))) return;
  const value = raw.replace(/^"|"$/gu, "").normalize("NFKC").toLowerCase();
  if (["text", "from", "to", "subject"].includes(field)) {
    return {
      type: "term",
      term: { field: field as "text" | "from" | "to" | "subject", value },
    };
  }
  if (field === "after" || field === "before") {
    const date = value.replaceAll("/", "-");
    if (!/^\d{4}-\d{2}-\d{2}$/u.test(date)) return;
    const utc = new Date(`${date}T00:00:00Z`);
    if (
      !Number.isFinite(utc.getTime()) ||
      utc.toISOString().slice(0, 10) !== date
    )
      return;
    // Gmail interprets calendar dates at midnight PST, independent of the device timezone.
    return {
      type: "term",
      term: { field, value: Date.parse(`${date}T00:00:00-08:00`) },
    };
  }
  if (!LOCATION_FIELDS.has(field)) return;
  if (field === "in" && value === "anywhere") {
    widenCorpus(state);
    return { type: "any" };
  }
  const label = NAMED_LABEL_FIELDS.has(field)
    ? (state.labels.find(
        (entry) => entry.name.normalize("NFKC").toLowerCase() === value,
      )?.id ?? SYSTEM_SEARCH_LABELS[value])
    : SYSTEM_SEARCH_LABELS[value];
  if (!label) return;
  if (label === "SPAM" || label === "TRASH") widenCorpus(state);
  return { type: "term", term: { field: "label", value: label } };
}

/** Excluding spam or trash is not a request to search it, so a negated term
 *  must leave the default corpus alone. */
function widenCorpus(state: ParserState) {
  if (!state.negated) state.includeSpamTrash = true;
}

function matchesNode(message: SearchMessage, node: SearchNode): boolean {
  if (node.type === "any") return true;
  if (node.type === "not") return !matchesNode(message, node.node);
  if (node.type === "and")
    return node.nodes.every((child) => matchesNode(message, child));
  if (node.type === "or")
    return node.nodes.some((child) => matchesNode(message, child));
  const term = node.term;
  if (term.field === "label") {
    return term.value === ARCHIVE_SEARCH_LABEL
      ? isArchivedLocalMessage(message.labelIds)
      : (message.labelIds?.includes(term.value) ?? false);
  }
  if (term.field === "after" || term.field === "before") {
    const timestamp =
      message.internalDate && /^\d+$/u.test(message.internalDate)
        ? Number(message.internalDate)
        : Date.parse(message.internalDate || message.date || "");
    return term.field === "after"
      ? timestamp > term.value
      : timestamp < term.value;
  }
  return getNormalizedSearchText(message, term.field).includes(term.value);
}

function isArchivedLocalMessage(labelIds: string[] | undefined) {
  if (labelIds?.includes(ARCHIVE_SEARCH_LABEL)) return true;
  if (!labelIds?.length) return false;
  return !LIVE_MAILBOX_LABELS.some((label) => labelIds.includes(label));
}

/** Outlook stores a real archive label; Gmail has none, so the index cannot
 *  select archived mail by token and must fall back to an exact check. */
export const ARCHIVE_SEARCH_LABEL = "ARCHIVE";
const LOCATION_FIELDS = new Set(["in", "is", "label", "category"]);
const NAMED_LABEL_FIELDS = new Set(["label", "category"]);
/** A message in none of these is archived, which is how Gmail represents it. */
export const LIVE_MAILBOX_LABELS = ["INBOX", "SENT", "DRAFT", "SPAM", "TRASH"];
const SYSTEM_SEARCH_LABELS: Record<string, string> = {
  inbox: "INBOX",
  sent: "SENT",
  drafts: "DRAFT",
  draft: "DRAFT",
  spam: "SPAM",
  junk: "SPAM",
  trash: "TRASH",
  deleted: "TRASH",
  archive: ARCHIVE_SEARCH_LABEL,
  unread: "UNREAD",
  starred: "STARRED",
  flagged: "STARRED",
};
