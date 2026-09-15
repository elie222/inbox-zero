const MAX_RECENT_SEARCHES = 10;
const MAX_SUGGESTED_RECENT_SEARCHES = 5;

export function readRecentSearches(emailAccountId: string): string[] {
  try {
    const raw = window.localStorage.getItem(storageKey(emailAccountId));
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((entry): entry is string => typeof entry === "string")
      : [];
  } catch {
    return [];
  }
}

export function rememberRecentSearch(emailAccountId: string, query: string) {
  const next = addRecentSearch(readRecentSearches(emailAccountId), query);
  try {
    window.localStorage.setItem(
      storageKey(emailAccountId),
      JSON.stringify(next),
    );
  } catch {
    // Private mode or a full quota only loses the history, not the search.
  }
}

export function addRecentSearch(recent: string[], query: string): string[] {
  const trimmed = query.trim();
  if (!trimmed) return recent;
  const lowered = trimmed.toLowerCase();
  return [
    trimmed,
    ...recent.filter((entry) => entry.toLowerCase() !== lowered),
  ].slice(0, MAX_RECENT_SEARCHES);
}

/**
 * Recent searches worth offering for the text typed so far. An empty draft
 * offers the latest searches; otherwise only entries containing the draft,
 * excluding an exact match since choosing it would change nothing.
 */
export function matchRecentSearches(recent: string[], draft: string): string[] {
  const needle = draft.trim().toLowerCase();
  return recent
    .filter((entry) => {
      const entryLowered = entry.toLowerCase();
      return (
        !needle || (entryLowered !== needle && entryLowered.includes(needle))
      );
    })
    .slice(0, MAX_SUGGESTED_RECENT_SEARCHES);
}

function storageKey(emailAccountId: string) {
  return `mail-search-history:${emailAccountId}`;
}
