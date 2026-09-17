import {
  tokenizeSearchQuery,
  unquoteSearchValue,
} from "@/utils/mail/tokenize-search-query";
import { escapeSearchValue } from "@/utils/outlook/search-escape";
import type { WELL_KNOWN_FOLDERS } from "@/utils/outlook/constants";

export type OutlookWellKnownFolder = keyof typeof WELL_KNOWN_FOLDERS;

export type CompiledOutlookSearch = {
  /** Quoted Graph `$search` value, or empty when the query is filter-only. */
  search: string;
  folderKey?: OutlookWellKnownFolder;
  folderName?: string;
  flagged: boolean;
  category?: string;
};

const FOLDER_KEY_BY_IN_VALUE: Record<string, OutlookWellKnownFolder> = {
  inbox: "inbox",
  sent: "sentitems",
  drafts: "drafts",
  archive: "archive",
  junk: "junkemail",
  deleted: "deleteditems",
};

/**
 * Compiles an Outlook search-box query into Graph `$search` KQL plus the
 * folder/flag/category scopes Graph cannot mix into `$search`.
 */
export function compileOutlookThreadSearch(
  query: string,
): CompiledOutlookSearch {
  const included: string[] = [];
  const excluded: string[] = [];
  let folderKey: OutlookWellKnownFolder | undefined;
  let folderName: string | undefined;
  let flagged = false;
  let category: string | undefined;

  const tokens = tokenizeSearchQuery(query);
  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index];
    if (!token) continue;

    if (/^not$/i.test(token)) {
      const next = tokens[index + 1];
      if (!next) continue;
      const term = toKqlTerm(parseOutlookSearchToken(next));
      if (term) excluded.push(`NOT ${term}`);
      index += 1;
      continue;
    }

    const parsed = parseOutlookSearchToken(token);
    if (parsed.field === "in") {
      if (!parsed.excluded) {
        const key = FOLDER_KEY_BY_IN_VALUE[parsed.value.toLowerCase()];
        if (key && !folderKey && !folderName) folderKey = key;
      }
      continue;
    }
    if (parsed.field === "folder") {
      if (!parsed.excluded && parsed.value && !folderKey && !folderName) {
        folderName = parsed.value;
      }
      continue;
    }
    if (parsed.field === "is" && parsed.value.toLowerCase() === "flagged") {
      if (!parsed.excluded) flagged = true;
      continue;
    }
    if (parsed.field === "category") {
      if (!parsed.excluded && parsed.value && !category) {
        category = parsed.value;
      }
      continue;
    }

    const term = toKqlTerm(parsed);
    if (!term) continue;
    if (parsed.excluded) excluded.push(`NOT ${term}`);
    else included.push(term);
  }

  if (!included.length && !excluded.length) {
    return { search: "", folderKey, folderName, flagged, category };
  }
  // KQL rejects purely negative queries, so anchor them to every message.
  if (!included.length) included.push("size>=0");

  return {
    search: `"${[...included, ...excluded].join(" ")}"`,
    folderKey,
    folderName,
    flagged,
    category,
  };
}

export function isEmptyOutlookSearch(compiled: CompiledOutlookSearch): boolean {
  return (
    !compiled.search &&
    !compiled.folderKey &&
    !compiled.folderName &&
    !compiled.flagged &&
    !compiled.category
  );
}

export function parseOutlookSearchToken(token: string): {
  excluded: boolean;
  field: string | null;
  comparator: ":" | ">" | ">=" | "<" | "<=" | null;
  value: string;
} {
  const excluded = token.startsWith("-") && token.length > 1;
  const raw = excluded ? token.slice(1) : token;
  if (raw.startsWith('"')) {
    return {
      excluded,
      field: null,
      comparator: null,
      value: unquoteSearchValue(raw),
    };
  }

  const match = raw.match(/^([a-z]+)(>=|<=|>|<|:)(.*)$/i);
  if (!match || /^(https?|ftp|mailto|file)$/i.test(match[1])) {
    return {
      excluded,
      field: null,
      comparator: null,
      value: unquoteSearchValue(raw),
    };
  }

  return {
    excluded,
    field: match[1].toLowerCase(),
    comparator: match[2] as ":" | ">" | ">=" | "<" | "<=",
    value: unquoteSearchValue(match[3]),
  };
}

function toKqlTerm(
  parsed: ReturnType<typeof parseOutlookSearchToken>,
): string | null {
  const { field, comparator, value } = parsed;

  if (!field) return toKqlValue(value);

  if (field === "from" || field === "to" || field === "subject") {
    const kqlValue = toKqlValue(value);
    return kqlValue ? `${field}:${kqlValue}` : null;
  }

  if (field === "hasattachments" && /^(true|yes)$/i.test(value)) {
    return "hasattachments:true";
  }

  if (field === "size" && comparator && comparator !== ":") {
    const bytes = parseSizeBytes(value);
    if (bytes === null) return null;
    return `size${comparator}${bytes}`;
  }

  if (field === "received" && comparator && comparator !== ":") {
    const date = parseOutlookDate(value);
    if (!date) return null;
    return `received${comparator}${date}`;
  }

  // Unknown Outlook/KQL restrictions are passed through so typed queries like
  // importance:high still reach Graph.
  if (comparator === ":") {
    const kqlValue = toKqlValue(value);
    return kqlValue ? `${field}:${kqlValue}` : null;
  }

  return toKqlValue(value);
}

function toKqlValue(value: string): string | null {
  const cleaned = value
    .replace(/[?"\u201c\u201d\u2018\u2019]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return null;
  const escaped = escapeSearchValue(cleaned);
  // An unquoted colon would turn literal text into a property restriction.
  return /[\s:]/.test(cleaned) ? `\\"${escaped}\\"` : escaped;
}

function parseSizeBytes(value: string): number | null {
  const match = value.match(/^(\d+(?:\.\d+)?)(mb|kb|m|k)?$/i);
  if (!match) return null;
  const unit = match[2]?.toLowerCase();
  let bytes = Number(match[1]);
  if (unit === "k" || unit === "kb") bytes *= 1024;
  if (unit === "m" || unit === "mb") bytes *= 1024 ** 2;
  if (!Number.isFinite(bytes)) return null;
  return Math.round(bytes);
}

function parseOutlookDate(value: string): string | null {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const [, year, month, day] = match;
  const date = new Date(`${year}-${month}-${day}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return null;
  if (date.getUTCFullYear() !== Number(year)) return null;
  if (date.getUTCMonth() + 1 !== Number(month)) return null;
  if (date.getUTCDate() !== Number(day)) return null;
  return `${year}-${month}-${day}`;
}
