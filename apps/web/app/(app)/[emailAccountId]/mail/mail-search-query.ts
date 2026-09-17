import {
  parseSearchToken,
  tokenizeSearchQuery,
  unquoteSearchValue,
} from "@/utils/mail/tokenize-search-query";

export const DATE_WITHIN_OPTIONS = [
  { value: "1d", name: "1 day", days: 1 },
  { value: "3d", name: "3 days", days: 3 },
  { value: "1w", name: "1 week", days: 7 },
  { value: "2w", name: "2 weeks", days: 14 },
  { value: "1m", name: "1 month", days: 30 },
  { value: "2m", name: "2 months", days: 60 },
  { value: "6m", name: "6 months", days: 180 },
  { value: "1y", name: "1 year", days: 365 },
] as const;

export type DateWithin = (typeof DATE_WITHIN_OPTIONS)[number]["value"];

export const SEARCH_IN_OPTIONS = [
  { value: "all", name: "All Mail" },
  { value: "inbox", name: "Inbox" },
  { value: "starred", name: "Starred" },
  { value: "sent", name: "Sent Mail" },
  { value: "drafts", name: "Drafts" },
  { value: "spam", name: "Spam" },
  { value: "trash", name: "Trash" },
  { value: "anywhere", name: "Mail & Spam & Trash" },
] as const;

export type MailSearchFields = {
  from: string;
  to: string;
  subject: string;
  hasWords: string;
  doesntHave: string;
  sizeComparison: "greater" | "less";
  sizeValue: string;
  sizeUnit: "MB" | "KB";
  dateWithin: DateWithin;
  date: string;
  searchIn: string;
  hasAttachment: boolean;
  excludeChats: boolean;
};

export const EMPTY_MAIL_SEARCH_FIELDS: MailSearchFields = {
  from: "",
  to: "",
  subject: "",
  hasWords: "",
  doesntHave: "",
  sizeComparison: "greater",
  sizeValue: "",
  sizeUnit: "MB",
  dateWithin: "1d",
  date: "",
  searchIn: "all",
  hasAttachment: false,
  excludeChats: false,
};

const SEARCH_IN_OPERATOR: Record<string, string> = {
  inbox: "in:inbox",
  starred: "is:starred",
  sent: "in:sent",
  drafts: "in:drafts",
  spam: "in:spam",
  trash: "in:trash",
  anywhere: "in:anywhere",
};

const OPERATOR_TO_SEARCH_IN: Record<string, string> = {
  "in:inbox": "inbox",
  "is:starred": "starred",
  "in:sent": "sent",
  "in:drafts": "drafts",
  "in:spam": "spam",
  "in:trash": "trash",
  "in:anywhere": "anywhere",
};

const KNOWN_OPERATORS = new Set([
  "from",
  "to",
  "subject",
  "label",
  "in",
  "is",
  "larger",
  "smaller",
  "after",
  "before",
  "has",
]);

/** Turns the advanced-search form into a Gmail-style query string. */
export function buildMailSearchQuery(fields: MailSearchFields): string {
  const parts: string[] = [];

  pushOperator(parts, "from", fields.from);
  pushOperator(parts, "to", fields.to);
  pushOperator(parts, "subject", fields.subject);

  const hasWords = fields.hasWords.trim();
  if (hasWords) parts.push(hasWords);

  for (const term of splitSearchTerms(fields.doesntHave)) {
    parts.push(`-${quoteSearchValue(term)}`);
  }

  if (fields.hasAttachment) parts.push("has:attachment");

  const sizeQuery = buildSizeQuery(fields);
  if (sizeQuery) parts.push(sizeQuery);

  parts.push(...buildDateQuery(fields));

  const searchIn = fields.searchIn.trim();
  if (searchIn.startsWith("label:")) {
    pushOperator(parts, "label", searchIn.slice("label:".length));
  } else {
    const operator = SEARCH_IN_OPERATOR[searchIn];
    if (operator) parts.push(operator);
  }

  if (fields.excludeChats) parts.push("-in:chats");

  return parts.join(" ");
}

/** Combined inboxes only emit operators both Gmail and Outlook understand. */
export function toCommonMailSearchFields(
  fields: MailSearchFields,
): MailSearchFields {
  return {
    ...EMPTY_MAIL_SEARCH_FIELDS,
    from: fields.from,
    to: fields.to,
    subject: fields.subject,
    hasWords: fields.hasWords,
    doesntHave: fields.doesntHave,
  };
}

/** Fills the advanced-search form from a typed or previously composed query. */
export function parseMailSearchQuery(query: string): MailSearchFields {
  const fields: MailSearchFields = { ...EMPTY_MAIL_SEARCH_FIELDS };
  const hasWords: string[] = [];
  const doesntHave: string[] = [];
  let afterDate: Date | null = null;
  let beforeDate: Date | null = null;
  let afterToken = "";
  let beforeToken = "";

  for (const token of tokenizeSearchQuery(query)) {
    const parsed = parseSearchToken(token);
    if (!parsed.operator || !KNOWN_OPERATORS.has(parsed.operator)) {
      if (parsed.excluded && isSimpleExclusion(token, parsed.value)) {
        doesntHave.push(parsed.value);
      } else if (token) {
        hasWords.push(token);
      }
      continue;
    }

    // The form only represents -in:chats and simple -word leftovers.
    if (parsed.excluded) {
      if (parsed.operator === "in" && parsed.value.toLowerCase() === "chats") {
        fields.excludeChats = true;
        continue;
      }
      hasWords.push(token);
      continue;
    }

    if (parsed.operator === "from") {
      assignSingle(fields, "from", parsed.value, token, hasWords);
      continue;
    }
    if (parsed.operator === "to") {
      assignSingle(fields, "to", parsed.value, token, hasWords);
      continue;
    }
    if (parsed.operator === "subject") {
      assignSingle(fields, "subject", parsed.value, token, hasWords);
      continue;
    }
    if (
      parsed.operator === "has" &&
      parsed.value.toLowerCase() === "attachment"
    ) {
      fields.hasAttachment = true;
      continue;
    }
    if (parsed.operator === "larger" || parsed.operator === "smaller") {
      const size = parseSizeValue(parsed.value);
      if (!size || fields.sizeValue) {
        hasWords.push(token);
        continue;
      }
      fields.sizeComparison = parsed.operator === "larger" ? "greater" : "less";
      fields.sizeValue = size.value;
      fields.sizeUnit = size.unit;
      continue;
    }
    if (parsed.operator === "after") {
      afterDate = parseGmailDate(parsed.value);
      if (!afterDate) hasWords.push(token);
      else afterToken = token;
      continue;
    }
    if (parsed.operator === "before") {
      beforeDate = parseGmailDate(parsed.value);
      if (!beforeDate) hasWords.push(token);
      else beforeToken = token;
      continue;
    }
    if (parsed.operator === "label") {
      assignSearchIn(fields, `label:${parsed.value}`, token, hasWords);
      continue;
    }
    const searchIn =
      OPERATOR_TO_SEARCH_IN[`${parsed.operator}:${parsed.value.toLowerCase()}`];
    if (searchIn) {
      assignSearchIn(fields, searchIn, token, hasWords);
      continue;
    }

    hasWords.push(token);
  }

  if (afterDate && beforeDate) {
    applyDateWindow(
      fields,
      afterDate,
      beforeDate,
      hasWords,
      afterToken,
      beforeToken,
    );
  } else {
    if (afterToken) hasWords.push(afterToken);
    if (beforeToken) hasWords.push(beforeToken);
  }

  fields.hasWords = hasWords.join(" ").trim();
  fields.doesntHave = doesntHave.join(" ").trim();
  return fields;
}

function pushOperator(parts: string[], operator: string, value: string) {
  const trimmed = value.trim();
  if (!trimmed) return;
  parts.push(`${operator}:${quoteSearchValue(trimmed)}`);
}

function buildSizeQuery(fields: MailSearchFields): string | null {
  const amount = Number(fields.sizeValue);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  const operator = fields.sizeComparison === "greater" ? "larger" : "smaller";
  const unit = fields.sizeUnit === "KB" ? "K" : "M";
  return `${operator}:${amount}${unit}`;
}

function buildDateQuery(fields: MailSearchFields): string[] {
  if (!fields.date) return [];
  const center = parseInputDate(fields.date);
  if (!center) return [];
  const days =
    DATE_WITHIN_OPTIONS.find((option) => option.value === fields.dateWithin)
      ?.days ?? 1;
  return [
    `after:${formatGmailDate(addDays(center, -days))}`,
    `before:${formatGmailDate(addDays(center, days))}`,
  ];
}

function applyDateWindow(
  fields: MailSearchFields,
  afterDate: Date,
  beforeDate: Date,
  hasWords: string[],
  afterToken: string,
  beforeToken: string,
) {
  const spanDays = daysBetween(afterDate, beforeDate);
  if (spanDays > 0 && spanDays % 2 === 0) {
    const windowDays = spanDays / 2;
    const match = DATE_WITHIN_OPTIONS.find(
      (option) => option.days === windowDays,
    );
    if (match) {
      fields.dateWithin = match.value;
      fields.date = formatInputDate(addDays(afterDate, match.days));
      return;
    }
  }
  hasWords.push(afterToken, beforeToken);
}

function isSimpleExclusion(token: string, value: string): boolean {
  return Boolean(value) && token === `-${value}` && !/[\s":():]/.test(value);
}

function assignSingle(
  fields: MailSearchFields,
  key: "from" | "to" | "subject",
  value: string,
  token: string,
  hasWords: string[],
) {
  if (fields[key]) {
    hasWords.push(token);
    return;
  }
  fields[key] = value;
}

function assignSearchIn(
  fields: MailSearchFields,
  searchIn: string,
  token: string,
  hasWords: string[],
) {
  if (fields.searchIn !== "all") {
    hasWords.push(token);
    return;
  }
  fields.searchIn = searchIn;
}

function parseSizeValue(
  value: string,
): { value: string; unit: "MB" | "KB" } | null {
  const match = value.trim().match(/^(\d+(?:\.\d+)?)([kKmM])$/);
  if (!match) return null;
  const unit = match[2]?.toLowerCase() === "k" ? "KB" : "MB";
  return { value: match[1], unit };
}

function splitSearchTerms(value: string): string[] {
  return tokenizeSearchQuery(value).map((term) => unquoteSearchValue(term));
}

function quoteSearchValue(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (/[\s":()]/.test(trimmed)) return `"${trimmed.replaceAll('"', "")}"`;
  return trimmed;
}

function parseInputDate(value: string): Date | null {
  const match = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const date = new Date(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
  );
  return Number.isNaN(date.getTime()) ? null : date;
}

function parseGmailDate(value: string): Date | null {
  const unix = Number(value);
  if (Number.isFinite(unix) && !value.includes("/") && unix > 1_000_000_000) {
    const date = new Date(unix * 1000);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const match = value.trim().match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
  if (!match) return null;
  const date = new Date(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
  );
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatGmailDate(date: Date): string {
  return `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}`;
}

function formatInputDate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  next.setDate(next.getDate() + days);
  return next;
}

function daysBetween(start: Date, end: Date): number {
  return Math.round((end.getTime() - start.getTime()) / 86_400_000);
}
