import type { Message } from "@microsoft/microsoft-graph-types";
import { escapeODataString } from "@/utils/outlook/odata-escape";

export type OutlookMetadataFilters = {
  isRead?: boolean;
  categoryNames: string[];
};

export type OutlookMetadataSearchOptions = {
  readState?: "read" | "unread";
  categoryNames?: string[];
};

const EMPTY_METADATA_PARSE_RESULT = {
  searchQuery: "",
  filters: { isRead: undefined, categoryNames: [] as string[] },
  odataFilters: [] as string[],
};

export function parseOutlookMetadataSearchQuery(
  query: string,
  options: OutlookMetadataSearchOptions = {},
): {
  searchQuery: string;
  filters: OutlookMetadataFilters;
  odataFilters: string[];
} {
  if (!query && !hasMetadataOptions(options))
    return EMPTY_METADATA_PARSE_RESULT;

  const stateTerms = getStandaloneOutlookStateTerms(query);
  const hasRead = stateTerms.includes("read");
  const hasUnread = stateTerms.includes("unread");
  const queryReadState = hasRead === hasUnread ? undefined : hasRead;
  const optionReadState =
    options.readState === "read"
      ? true
      : options.readState === "unread"
        ? false
        : undefined;
  const isRead = optionReadState ?? queryReadState;
  const searchQuery = stripStandaloneOutlookStateTerms(query).trim();

  const filters = {
    isRead,
    categoryNames: [...new Set(options.categoryNames ?? [])],
  };

  return {
    searchQuery,
    filters,
    odataFilters: createOutlookMetadataODataFilters(filters),
  };
}

export function matchesOutlookMetadataFilters(
  message: Message,
  filters: OutlookMetadataFilters,
) {
  if (
    typeof filters.isRead === "boolean" &&
    message.isRead !== filters.isRead
  ) {
    return false;
  }

  if (filters.categoryNames.length) {
    const messageCategories = new Set(message.categories ?? []);
    return filters.categoryNames.every((categoryName) =>
      messageCategories.has(categoryName),
    );
  }

  return true;
}

function hasMetadataOptions(options: OutlookMetadataSearchOptions) {
  return Boolean(options.readState || options.categoryNames?.length);
}

export function stripStandaloneOutlookStateTerms(query: string) {
  return splitOutlookQueryTerms(query)
    .filter((term) => {
      const normalized = stripOutlookGrouping(term).toLowerCase();
      return normalized !== "read" && normalized !== "unread";
    })
    .join(" ");
}

export function getStandaloneOutlookStateTerms(query: string) {
  return splitOutlookQueryTerms(query)
    .map((term) => stripOutlookGrouping(term).toLowerCase())
    .filter((term) => term === "read" || term === "unread");
}

function splitOutlookQueryTerms(query: string) {
  const terms: string[] = [];
  let current = "";
  let inQuotes = false;

  for (const char of query) {
    if (char === '"') {
      inQuotes = !inQuotes;
      current += char;
      continue;
    }

    if (!inQuotes && /\s/.test(char)) {
      if (current) {
        terms.push(current);
        current = "";
      }
      continue;
    }

    current += char;
  }

  if (current) {
    terms.push(current);
  }

  return terms;
}

function stripOutlookGrouping(value: string) {
  return value.replace(/^[()]+|[()]+$/g, "");
}

function createOutlookMetadataODataFilters(filters: OutlookMetadataFilters) {
  const odataFilters: string[] = [];

  if (typeof filters.isRead === "boolean") {
    odataFilters.push(`isRead eq ${filters.isRead}`);
  }

  for (const categoryName of filters.categoryNames) {
    odataFilters.push(
      `categories/any(category: category eq '${escapeODataString(categoryName)}')`,
    );
  }

  return odataFilters;
}
