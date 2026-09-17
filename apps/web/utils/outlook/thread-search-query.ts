import {
  parseSearchToken,
  tokenizeSearchQuery,
} from "@/utils/mail/tokenize-search-query";
import { escapeSearchValue } from "@/utils/outlook/search-escape";

/**
 * Translates the Gmail-style query built by the mail search box into a Graph
 * `$search` value. Graph only accepts field restrictions when the whole KQL
 * expression is wrapped in double quotes, and it has no equivalent for
 * folder/label scoping, so those operators are dropped.
 */
export function buildOutlookThreadSearchQuery(query: string): string {
  const included: string[] = [];
  const excluded: string[] = [];

  for (const token of tokenizeSearchQuery(query)) {
    const { excluded: isExcluded, operator, value } = parseSearchToken(token);
    const term = toKqlTerm(operator, value);
    if (!term) continue;
    if (isExcluded) excluded.push(`NOT ${term}`);
    else included.push(term);
  }

  if (!included.length && !excluded.length) return "";
  // KQL rejects purely negative queries, so anchor them to every message.
  if (!included.length) included.push("size>=0");

  return `"${[...included, ...excluded].join(" ")}"`;
}

function toKqlTerm(operator: string | null, value: string): string | null {
  switch (operator) {
    case "from":
    case "to":
    case "subject": {
      const kqlValue = toKqlValue(value);
      return kqlValue ? `${operator}:${kqlValue}` : null;
    }
    case "larger":
    case "smaller": {
      const bytes = parseSizeBytes(value);
      if (bytes === null) return null;
      return `size${operator === "larger" ? ">" : "<"}${bytes}`;
    }
    case "has":
      return value.toLowerCase() === "attachment"
        ? "hasattachments:true"
        : null;
    case "after":
    case "before": {
      const date = parseGmailDate(value);
      if (!date) return null;
      return `received${operator === "after" ? ">=" : "<"}${date}`;
    }
    case "in":
    case "is":
    case "label":
      return null;
    case null:
      return toKqlValue(value);
    default:
      return toKqlValue(`${operator}:${value}`);
  }
}

function toKqlValue(value: string): string | null {
  const cleaned = value.replace(/[?"]/g, " ").replace(/\s+/g, " ").trim();
  if (!cleaned) return null;
  const escaped = escapeSearchValue(cleaned);
  // An unquoted colon would turn literal text into a property restriction.
  return /[\s:]/.test(cleaned) ? `\\"${escaped}\\"` : escaped;
}

function parseSizeBytes(value: string): number | null {
  const match = value.match(/^(\d+(?:\.\d+)?)([km])?$/i);
  if (!match) return null;
  const unit = match[2]?.toLowerCase();
  let bytes = Number(match[1]);
  if (unit === "k") bytes *= 1024;
  if (unit === "m") bytes *= 1024 ** 2;
  if (!Number.isFinite(bytes)) return null;
  return Math.round(bytes);
}

function parseGmailDate(value: string): string | null {
  const match = value.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/);
  if (!match) return null;
  const [, year, month, day] = match;
  const date = new Date(`${year}-01-01T00:00:00Z`);
  date.setUTCMonth(Number(month) - 1, Number(day));
  if (date.getUTCMonth() !== Number(month) - 1) return null;
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}
