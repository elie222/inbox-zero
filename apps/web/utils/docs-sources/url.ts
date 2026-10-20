import { isSafeExternalHttpUrl } from "@inboxzero/network/safe-url";

/**
 * Normalizes a user-entered docs site to `https://host[:port][/path/prefix]`,
 * dropping query, hash, and trailing slashes. Returns null when the URL is not
 * a public https address.
 */
export function normalizeDocsSourceUrl(input: string): string | null {
  const trimmed = input.trim();
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;

  const url = parseUrl(withScheme);
  if (url?.protocol !== "https:") return null;
  if (url.username || url.password) return null;
  if (!isSafeExternalHttpUrl(url.href)) return null;
  if (hasEncodedSeparator(url.pathname)) return null;

  const prefix = url.pathname.replace(/\/+$/, "");
  return `${url.origin}${prefix}`;
}

/**
 * Whether `url` is an https URL on the same origin as one of the sources and
 * inside its path prefix. Prefixes match whole path segments, so `/docs`
 * allows `/docs` and `/docs/intro` but not `/docs-internal`.
 */
export function isUrlInDocsSources(url: string, sources: string[]): boolean {
  const parsed = parseUrl(url);
  if (parsed?.protocol !== "https:") return false;
  if (parsed.username || parsed.password) return false;
  if (hasEncodedSeparator(parsed.pathname)) return false;

  return sources.some((source) => {
    const sourceUrl = parseUrl(source);
    if (!sourceUrl || sourceUrl.origin !== parsed.origin) return false;

    const prefix = sourceUrl.pathname.replace(/\/+$/, "");
    if (!prefix) return true;

    return (
      parsed.pathname === prefix || parsed.pathname.startsWith(`${prefix}/`)
    );
  });
}

function parseUrl(value: string): URL | null {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

// Servers may decode %2F or %5C into separators after our prefix check, which
// would let a path like /docs%2F..%2Fadmin escape the prefix.
function hasEncodedSeparator(pathname: string) {
  return /%2f|%5c/i.test(pathname);
}
