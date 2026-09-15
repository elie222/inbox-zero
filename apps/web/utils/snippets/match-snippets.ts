export type SnippetMatchItem = {
  content: string;
  id: string;
  shortcut: string;
};

export function filterSnippets(
  snippets: SnippetMatchItem[],
  query: string,
): SnippetMatchItem[] {
  const normalized = normalizeSnippetQuery(query);
  const filtered = normalized
    ? snippets.filter((snippet) => matchesSnippetQuery(snippet, normalized))
    : [...snippets];

  return filtered.sort((a, b) => {
    const rankDelta =
      snippetMatchRank(a, normalized) - snippetMatchRank(b, normalized);
    if (rankDelta !== 0) return rankDelta;
    return a.shortcut.localeCompare(b.shortcut);
  });
}

export function initialSnippetSelectionIndex({
  createItem,
  query,
  snippets,
}: {
  createItem: boolean;
  query: string;
  snippets: SnippetMatchItem[];
}): number {
  if (!createItem) return 0;

  const normalized = normalizeSnippetQuery(query);
  if (!normalized) return snippets.length ? 1 : 0;

  const matchIndex = snippets.findIndex(
    (snippet) =>
      snippet.shortcut === normalized ||
      snippet.shortcut.startsWith(normalized),
  );
  return matchIndex >= 0 ? matchIndex + 1 : 0;
}

export function normalizeSnippetQuery(query: string): string {
  return query.trim().replace(/^\/+/, "").toLowerCase();
}

export function snippetPreview(content: string): string {
  return content.replace(/\s+/g, " ").trim();
}

function matchesSnippetQuery(
  snippet: SnippetMatchItem,
  query: string,
): boolean {
  return (
    snippet.shortcut.includes(query) ||
    snippet.content.toLowerCase().includes(query)
  );
}

function snippetMatchRank(snippet: SnippetMatchItem, query: string): number {
  if (!query) return 1;
  if (snippet.shortcut === query) return 0;
  if (snippet.shortcut.startsWith(query)) return 1;
  return 2;
}
