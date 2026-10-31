import { safePublicFetch } from "@/utils/mcp/safe-fetch";
import {
  type DocsIndexEntry,
  parseLlmsTxt,
  parseSitemap,
} from "@/utils/docs-sources/docs-index";
import { docsHtmlToText } from "@/utils/docs-sources/page-text";
import { isUrlInDocsSources } from "@/utils/docs-sources/url";
import { getCachedDocs, setCachedDocs } from "@/utils/redis/docs-cache";

const MAX_REDIRECTS = 5;
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 10_000;
const MAX_PAGE_CHARS = 12_000;
const MAX_CHILD_SITEMAPS = 3;
const EMPTY_INDEX_TTL_SECONDS = 10 * 60;

/**
 * Builds the page index for each docs source from its llms.txt, falling back
 * to sitemap.xml. Index files are looked for under the source prefix first,
 * then at the site root; either way only pages inside the sources are kept.
 */
export async function getDocsIndex(
  sources: string[],
): Promise<DocsIndexEntry[]> {
  const indexes = await Promise.all(sources.map(getSourceIndex));
  return indexes.flat();
}

/**
 * Fetches a docs page, refusing any URL or redirect hop outside the sources,
 * and returns it as truncated text with the in-scope links it contains.
 */
export async function readDocsPage(
  url: string,
  sources: string[],
): Promise<string> {
  if (!isUrlInDocsSources(url, sources)) {
    throw new DocsFetchError(
      "That URL is outside the documentation sites this account allows.",
    );
  }

  const cacheKey = [...[...sources].sort(), url];
  const cached = await getCachedDocs<string>("page", cacheKey);
  if (cached) return cached;

  const resource = await fetchDocsResource(url, sources);

  let text: string;
  let links: string[] = [];
  if (resource.contentType.includes("html")) {
    ({ text, links } = docsHtmlToText(resource.body, resource.url, sources));
  } else if (isTextContentType(resource.contentType)) {
    text = resource.body.trim();
  } else {
    throw new DocsFetchError("That page is not a text or HTML document.");
  }

  const truncated =
    text.length > MAX_PAGE_CHARS
      ? `${text.slice(0, MAX_PAGE_CHARS)}\n[truncated]`
      : text;
  const result = [
    `URL: ${resource.url}`,
    "",
    truncated || "(empty page)",
    ...(links.length ? ["", "Links on this page:", ...links] : []),
  ].join("\n");

  await setCachedDocs("page", cacheKey, result);
  return result;
}

/**
 * Fetches a URL through the SSRF guard, following redirects manually so every
 * hop is checked against `allowed` before it is requested.
 */
export async function fetchDocsResource(
  url: string,
  allowed: string[],
): Promise<{ url: string; contentType: string; body: string }> {
  let currentUrl = url;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    if (!isUrlInDocsSources(currentUrl, allowed)) {
      throw new DocsFetchError(
        hop === 0
          ? "That URL is outside the documentation sites this account allows."
          : "The page redirected outside the documentation sites this account allows.",
      );
    }

    const response = await safePublicFetch(currentUrl, {
      headers: { Accept: "text/markdown, text/html;q=0.9, text/plain;q=0.8" },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (response.status >= 300 && response.status < 400) {
      await response.body?.cancel();
      const location = response.headers.get("location");
      if (!location) {
        throw new DocsFetchError("The page redirected without a location.");
      }
      currentUrl = new URL(location, currentUrl).href;
      continue;
    }

    if (!response.ok) {
      await response.body?.cancel();
      throw new DocsFetchError(`The page returned HTTP ${response.status}.`);
    }

    return {
      url: currentUrl,
      contentType: response.headers.get("content-type")?.toLowerCase() ?? "",
      body: await readLimitedText(response),
    };
  }

  throw new DocsFetchError("The page redirected too many times.");
}

export class DocsFetchError extends Error {}

async function getSourceIndex(source: string): Promise<DocsIndexEntry[]> {
  const cached = await getCachedDocs<DocsIndexEntry[]>("index", [source]);
  if (cached) return cached;

  const entries =
    (await getLlmsTxtIndex(source)) ?? (await getSitemapIndex(source)) ?? [];

  // A fetch failure looks the same as a site without an index, so an empty
  // result is only cached briefly
  await setCachedDocs(
    "index",
    [source],
    entries,
    entries.length ? undefined : EMPTY_INDEX_TTL_SECONDS,
  );
  return entries;
}

async function getLlmsTxtIndex(source: string) {
  for (const { url, allowed } of indexFileCandidates(source, "llms.txt")) {
    const resource = await fetchDocsResource(url, allowed).catch(() => null);
    if (!resource || resource.contentType.includes("html")) continue;

    const entries = parseLlmsTxt(resource.body, resource.url, [source]);
    if (entries.length) return entries;
  }
  return null;
}

async function getSitemapIndex(source: string) {
  for (const { url, allowed } of indexFileCandidates(source, "sitemap.xml")) {
    const resource = await fetchDocsResource(url, allowed).catch(() => null);
    if (!resource) continue;

    const { entries, childSitemaps } = parseSitemap(
      resource.body,
      resource.url,
      [source],
    );

    const childEntries = await Promise.all(
      childSitemaps
        .filter((child) => isUrlInDocsSources(child, allowed))
        .slice(0, MAX_CHILD_SITEMAPS)
        .map(async (child) => {
          const childResource = await fetchDocsResource(child, allowed).catch(
            () => null,
          );
          return childResource
            ? parseSitemap(childResource.body, childResource.url, [source])
                .entries
            : [];
        }),
    );

    const allEntries = [...entries, ...childEntries.flat()];
    if (allEntries.length) return allEntries;
  }
  return null;
}

function indexFileCandidates(source: string, fileName: string) {
  const { origin } = new URL(source);
  const candidates = [{ url: `${source}/${fileName}`, allowed: [source] }];
  if (source !== origin) {
    candidates.push({ url: `${origin}/${fileName}`, allowed: [origin] });
  }
  return candidates;
}

function isTextContentType(contentType: string) {
  return (
    !contentType ||
    contentType.startsWith("text/") ||
    contentType.includes("markdown")
  );
}

async function readLimitedText(response: Response) {
  if (!response.body) return "";

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;

  while (size < MAX_RESPONSE_BYTES) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    size += value.byteLength;
  }
  await reader.cancel();

  return new TextDecoder().decode(
    Buffer.concat(chunks).subarray(0, MAX_RESPONSE_BYTES),
  );
}
