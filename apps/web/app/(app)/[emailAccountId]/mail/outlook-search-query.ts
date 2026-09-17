import {
  tokenizeSearchQuery,
  unquoteSearchValue,
} from "@/utils/mail/tokenize-search-query";
import { parseOutlookSearchToken } from "@/utils/outlook/thread-search-query";

export const OUTLOOK_DATE_WITHIN_OPTIONS = [
  { value: "1d", name: "1 day", days: 1 },
  { value: "3d", name: "3 days", days: 3 },
  { value: "1w", name: "1 week", days: 7 },
  { value: "2w", name: "2 weeks", days: 14 },
  { value: "1m", name: "1 month", days: 30 },
  { value: "2m", name: "2 months", days: 60 },
  { value: "6m", name: "6 months", days: 180 },
  { value: "1y", name: "1 year", days: 365 },
] as const;

export type OutlookDateWithin =
  (typeof OUTLOOK_DATE_WITHIN_OPTIONS)[number]["value"];

export const OUTLOOK_SEARCH_IN_OPTIONS = [
  { value: "all", name: "All Mail" },
  { value: "inbox", name: "Inbox" },
  { value: "flagged", name: "Flagged" },
  { value: "sent", name: "Sent" },
  { value: "drafts", name: "Drafts" },
  { value: "archive", name: "Archive" },
  { value: "junk", name: "Junk Email" },
  { value: "deleted", name: "Deleted Items" },
] as const;

export type OutlookSearchFields = {
  from: string;
  to: string;
  subject: string;
  keywords: string;
  doesntHave: string;
  sizeComparison: "greater" | "less";
  sizeValue: string;
  sizeUnit: "MB" | "KB";
  dateWithin: OutlookDateWithin;
  date: string;
  searchIn: string;
  hasAttachment: boolean;
};

export const EMPTY_OUTLOOK_SEARCH_FIELDS: OutlookSearchFields = {
  from: "",
  to: "",
  subject: "",
  keywords: "",
  doesntHave: "",
  sizeComparison: "greater",
  sizeValue: "",
  sizeUnit: "MB",
  dateWithin: "1d",
  date: "",
  searchIn: "all",
  hasAttachment: false,
};

const SEARCH_IN_OPERATOR: Record<string, string> = {
  inbox: "in:inbox",
  flagged: "is:flagged",
  sent: "in:sent",
  drafts: "in:drafts",
  archive: "in:archive",
  junk: "in:junk",
  deleted: "in:deleted",
};

const OPERATOR_TO_SEARCH_IN: Record<string, string> = Object.fromEntries(
  Object.entries(SEARCH_IN_OPERATOR).map(([searchIn, operator]) => [
    operator,
    searchIn,
  ]),
);

export function buildOutlookSearchQuery(fields: OutlookSearchFields): string {
  const parts: string[] = [];

  pushOperator(parts, "from", fields.from);
  pushOperator(parts, "to", fields.to);
  pushOperator(parts, "subject", fields.subject);

  const keywords = fields.keywords.trim();
  if (keywords) parts.push(keywords);

  for (const term of splitSearchTerms(fields.doesntHave)) {
    parts.push(`NOT ${quoteSearchValue(term)}`);
  }

  if (fields.hasAttachment) parts.push("hasattachments:true");

  const sizeQuery = buildSizeQuery(fields);
  if (sizeQuery) parts.push(sizeQuery);

  parts.push(...buildDateQuery(fields));

  const searchIn = fields.searchIn.trim();
  if (searchIn.startsWith("folder:")) {
    pushOperator(parts, "folder", searchIn.slice("folder:".length));
  } else if (searchIn.startsWith("category:")) {
    pushOperator(parts, "category", searchIn.slice("category:".length));
  } else {
    const operator = SEARCH_IN_OPERATOR[searchIn];
    if (operator) parts.push(operator);
  }

  return parts.join(" ");
}

export function parseOutlookSearchQuery(query: string): OutlookSearchFields {
  const fields: OutlookSearchFields = { ...EMPTY_OUTLOOK_SEARCH_FIELDS };
  const keywords: string[] = [];
  const doesntHave: string[] = [];
  let receivedAfter: Date | null = null;
  let receivedBefore: Date | null = null;
  let afterToken = "";
  let beforeToken = "";

  const tokens = tokenizeSearchQuery(query);
  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index];
    if (!token) continue;

    if (/^not$/i.test(token)) {
      const next = tokens[index + 1];
      if (next) {
        const parsedNext = parseOutlookSearchToken(next);
        if (!parsedNext.field && isSimpleKeyword(parsedNext.value)) {
          doesntHave.push(parsedNext.value);
          index += 1;
          continue;
        }
      }
      keywords.push(token);
      continue;
    }

    const parsed = parseOutlookSearchToken(token);
    if (parsed.excluded && !parsed.field && isSimpleKeyword(parsed.value)) {
      doesntHave.push(parsed.value);
      continue;
    }

    if (!parsed.field) {
      keywords.push(token);
      continue;
    }

    if (parsed.excluded) {
      keywords.push(token);
      continue;
    }

    switch (parsed.field) {
      case "from":
      case "to":
      case "subject":
        assignSingle(fields, parsed.field, parsed.value, token, keywords);
        continue;
      case "hasattachments":
        if (/^(true|yes)$/i.test(parsed.value)) {
          fields.hasAttachment = true;
          continue;
        }
        break;
      case "size": {
        if (!parsed.comparator) break;
        const size = parseSizeValue(parsed.value, parsed.comparator);
        if (!size || fields.sizeValue) {
          keywords.push(token);
          continue;
        }
        fields.sizeComparison = size.comparison;
        fields.sizeValue = size.value;
        fields.sizeUnit = size.unit;
        continue;
      }
      case "received": {
        if (!parsed.comparator) break;
        const date = parseOutlookDate(parsed.value);
        if (!date) {
          keywords.push(token);
          continue;
        }
        if (parsed.comparator === ">=" || parsed.comparator === ">") {
          receivedAfter = date;
          afterToken = token;
        } else {
          receivedBefore = date;
          beforeToken = token;
        }
        continue;
      }
      case "folder":
        assignSearchIn(fields, `folder:${parsed.value}`, token, keywords);
        continue;
      case "category":
        assignSearchIn(fields, `category:${parsed.value}`, token, keywords);
        continue;
    }

    const searchIn =
      OPERATOR_TO_SEARCH_IN[`${parsed.field}:${parsed.value.toLowerCase()}`];
    if (searchIn) {
      assignSearchIn(fields, searchIn, token, keywords);
      continue;
    }

    keywords.push(token);
  }

  if (receivedAfter && receivedBefore) {
    applyDateWindow(
      fields,
      receivedAfter,
      receivedBefore,
      keywords,
      afterToken,
      beforeToken,
    );
  } else {
    if (afterToken) keywords.push(afterToken);
    if (beforeToken) keywords.push(beforeToken);
  }

  fields.keywords = keywords.join(" ").trim();
  fields.doesntHave = doesntHave.join(" ").trim();
  return fields;
}

function pushOperator(parts: string[], operator: string, value: string) {
  const trimmed = value.trim();
  if (!trimmed) return;
  parts.push(`${operator}:${quoteSearchValue(trimmed)}`);
}

function buildSizeQuery(fields: OutlookSearchFields): string | null {
  const amount = Number(fields.sizeValue);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  const comparator = fields.sizeComparison === "greater" ? ">" : "<";
  return `size${comparator}${amount}${fields.sizeUnit}`;
}

function buildDateQuery(fields: OutlookSearchFields): string[] {
  if (!fields.date) return [];
  const center = parseInputDate(fields.date);
  if (!center) return [];
  const days =
    OUTLOOK_DATE_WITHIN_OPTIONS.find(
      (option) => option.value === fields.dateWithin,
    )?.days ?? 1;
  return [
    `received>=${formatInputDate(addDays(center, -days))}`,
    `received<${formatInputDate(addDays(center, days))}`,
  ];
}

function applyDateWindow(
  fields: OutlookSearchFields,
  afterDate: Date,
  beforeDate: Date,
  keywords: string[],
  afterToken: string,
  beforeToken: string,
) {
  const spanDays = daysBetween(afterDate, beforeDate);
  if (spanDays > 0 && spanDays % 2 === 0) {
    const windowDays = spanDays / 2;
    const match = OUTLOOK_DATE_WITHIN_OPTIONS.find(
      (option) => option.days === windowDays,
    );
    if (match) {
      fields.dateWithin = match.value;
      fields.date = formatInputDate(addDays(afterDate, match.days));
      return;
    }
  }
  keywords.push(afterToken, beforeToken);
}

function isSimpleKeyword(value: string): boolean {
  return Boolean(value) && !/[\s":():]/.test(value);
}

function assignSingle(
  fields: OutlookSearchFields,
  key: "from" | "to" | "subject",
  value: string,
  token: string,
  keywords: string[],
) {
  if (fields[key]) {
    keywords.push(token);
    return;
  }
  fields[key] = value;
}

function assignSearchIn(
  fields: OutlookSearchFields,
  searchIn: string,
  token: string,
  keywords: string[],
) {
  if (fields.searchIn !== "all") {
    keywords.push(token);
    return;
  }
  fields.searchIn = searchIn;
}

function parseSizeValue(
  value: string,
  comparator: string,
): {
  comparison: "greater" | "less";
  value: string;
  unit: "MB" | "KB";
} | null {
  if (comparator !== ">" && comparator !== "<") return null;
  const match = value.trim().match(/^(\d+(?:\.\d+)?)(mb|kb|m|k)$/i);
  if (!match) return null;
  const unit = match[2].toLowerCase().startsWith("k") ? "KB" : "MB";
  return {
    comparison: comparator === ">" ? "greater" : "less",
    value: match[1],
    unit,
  };
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

function parseOutlookDate(value: string): Date | null {
  const match = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const date = new Date(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
  );
  if (Number.isNaN(date.getTime())) return null;
  if (date.getFullYear() !== Number(match[1])) return null;
  if (date.getMonth() + 1 !== Number(match[2])) return null;
  if (date.getDate() !== Number(match[3])) return null;
  return date;
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
