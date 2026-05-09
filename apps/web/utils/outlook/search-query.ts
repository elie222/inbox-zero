import type { Message } from "@microsoft/microsoft-graph-types";
import { escapeODataString } from "@/utils/outlook/odata-escape";

const OUTLOOK_CATEGORY_SEARCH_FIELDS = new Set([
  "category",
  "categories",
  "label",
  "labels",
]);
const URL_SCHEME_PATTERN = /^(https?|ftp|mailto|file):/i;

export type OutlookMetadataFilters = {
  isRead?: boolean;
  categoryNames: string[];
};

const EMPTY_METADATA_PARSE_RESULT = {
  searchQuery: "",
  filters: { isRead: undefined, categoryNames: [] as string[] },
  odataFilters: [] as string[],
};

export function parseOutlookMetadataSearchQuery(
  query: string,
  categoryMap: Map<string, string>,
): {
  searchQuery: string;
  filters: OutlookMetadataFilters;
  odataFilters: string[];
} {
  if (!query) return EMPTY_METADATA_PARSE_RESULT;

  const stateTerms = getStandaloneOutlookStateTerms(query);
  const hasRead = stateTerms.includes("read");
  const hasUnread = stateTerms.includes("unread");
  const isRead = hasRead === hasUnread ? undefined : hasRead;
  const categoryLookup = createOutlookCategoryLookup(categoryMap);

  const terms = splitOutlookQueryTerms(stripStandaloneOutlookStateTerms(query));
  const remainingTerms: string[] = [];
  const categoryNames: string[] = [];

  for (const term of terms) {
    const parsedField = parseOutlookFieldTerm(term);
    if (parsedField && OUTLOOK_CATEGORY_SEARCH_FIELDS.has(parsedField.field)) {
      const categoryName = categoryLookup.get(
        normalizeOutlookMetadataSearchValue(parsedField.value),
      );
      if (categoryName) {
        categoryNames.push(categoryName);
        continue;
      }
    }

    remainingTerms.push(term);
  }

  let searchQuery = remainingTerms.join(" ").trim();
  if (searchQuery) {
    const categoryName = categoryLookup.get(
      normalizeOutlookMetadataSearchValue(unquoteSearchValue(searchQuery)),
    );
    if (categoryName) {
      categoryNames.push(categoryName);
      searchQuery = "";
    }
  }

  const filters = {
    isRead,
    categoryNames: [...new Set(categoryNames)],
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

function parseOutlookFieldTerm(term: string) {
  const colonIndex = term.indexOf(":");
  if (colonIndex === -1) return null;

  const field = stripOutlookGrouping(term.slice(0, colonIndex))
    .trim()
    .toLowerCase();
  const value = stripOutlookGrouping(term.slice(colonIndex + 1)).trim();
  if (!field || !value || URL_SCHEME_PATTERN.test(term)) return null;

  return {
    field,
    value: unquoteSearchValue(value),
  };
}

function stripOutlookGrouping(value: string) {
  return value.replace(/^[()]+|[()]+$/g, "");
}

function unquoteSearchValue(value: string) {
  const trimmed = value.trim();
  if (trimmed.length >= 2 && trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function createOutlookCategoryLookup(categoryMap: Map<string, string>) {
  const lookup = new Map<string, string>();

  for (const categoryName of categoryMap.keys()) {
    const normalized = normalizeOutlookMetadataSearchValue(categoryName);
    if (!normalized) continue;

    lookup.set(normalized, categoryName);

    const pluralAlias = `${normalized}s`;
    if (!normalized.endsWith("s") && !lookup.has(pluralAlias)) {
      lookup.set(pluralAlias, categoryName);
    }
  }

  return lookup;
}

function normalizeOutlookMetadataSearchValue(value: string) {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
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
