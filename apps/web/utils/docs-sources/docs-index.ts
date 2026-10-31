import { isUrlInDocsSources } from "@/utils/docs-sources/url";

export type DocsIndexEntry = {
  title: string;
  url: string;
  description?: string;
};

// Anchored to the start of the line so a hostile file can't force a retry from
// every "[" on a long line
const MARKDOWN_LINK =
  /^\s*(?:[-*+]\s+)?\[([^\]\n]{1,300})\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/;

/**
 * Parses an llms.txt file (https://llmstxt.org): markdown link lines such as
 * `- [Title](https://docs.example.com/page): Optional description`. Only links
 * inside the docs sources are kept.
 */
export function parseLlmsTxt(
  text: string,
  baseUrl: string,
  sources: string[],
): DocsIndexEntry[] {
  const entries: DocsIndexEntry[] = [];
  const seen = new Set<string>();

  for (const line of text.split("\n")) {
    const match = MARKDOWN_LINK.exec(line);
    if (!match) continue;

    const url = resolveUrl(match[2], baseUrl);
    if (!url || seen.has(url) || !isUrlInDocsSources(url, sources)) continue;
    seen.add(url);

    const description = line
      .slice(match.index + match[0].length)
      .replace(/^\s*[:\-–]\s*/, "")
      .trim();

    entries.push({
      title: match[1].trim(),
      url,
      ...(description ? { description } : {}),
    });
  }

  return entries;
}

/**
 * Parses a sitemap or sitemap index. Page URLs are filtered to the docs
 * sources; child sitemap URLs are returned for the caller to vet and fetch.
 */
export function parseSitemap(
  xml: string,
  baseUrl: string,
  sources: string[],
): { entries: DocsIndexEntry[]; childSitemaps: string[] } {
  const locs = [...xml.matchAll(/<loc>([^<]*)<\/loc>/gi)]
    .map((match) => resolveUrl(decodeXmlEntities(match[1].trim()), baseUrl))
    .filter((url): url is string => !!url);

  if (/<sitemapindex[\s>]/i.test(xml)) {
    return { entries: [], childSitemaps: locs };
  }

  const entries = [...new Set(locs)]
    .filter((url) => isUrlInDocsSources(url, sources))
    .map((url) => ({ title: titleFromUrl(url), url }));

  return { entries, childSitemaps: [] };
}

/**
 * Ranks index entries by how many query terms appear in the title, URL, and
 * description. Small indexes are returned whole so the model can pick pages
 * itself when wording differs from the docs.
 */
export function searchDocsIndex(
  entries: DocsIndexEntry[],
  queries: string[],
  { limit = 10, returnAllBelow = 30 } = {},
): DocsIndexEntry[] {
  if (entries.length <= returnAllBelow) return entries;

  const termSets = queries.map(tokenize).filter((terms) => terms.length);
  if (!termSets.length) return entries.slice(0, limit);

  return entries
    .map((entry, index) => ({
      entry,
      index,
      score: Math.max(...termSets.map((terms) => scoreEntry(entry, terms))),
    }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, limit)
    .map(({ entry }) => entry);
}

function scoreEntry(entry: DocsIndexEntry, terms: string[]) {
  const title = new Set(tokenize(entry.title));
  const path = new Set(tokenize(safePathname(entry.url)));
  const description = new Set(tokenize(entry.description ?? ""));

  return terms.reduce(
    (score, term) =>
      score +
      (title.has(term) ? 3 : 0) +
      (path.has(term) ? 2 : 0) +
      (description.has(term) ? 1 : 0),
    0,
  );
}

function tokenize(value: string) {
  return value.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
}

function titleFromUrl(url: string) {
  const segment = safePathname(url)
    .split("/")
    .filter(Boolean)
    .pop()
    ?.replace(/\.(md|mdx|html?)$/i, "");
  if (!segment) return new URL(url).host;
  return decodeURIComponentSafe(segment).replace(/[-_]+/g, " ");
}

function safePathname(url: string) {
  try {
    return new URL(url).pathname;
  } catch {
    return "";
  }
}

function resolveUrl(value: string, baseUrl: string) {
  try {
    const url = new URL(value, baseUrl);
    url.hash = "";
    return url.href;
  } catch {
    return null;
  }
}

function decodeXmlEntities(value: string) {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function decodeURIComponentSafe(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
