import { z } from "zod";

const MICROSOFT_GRAPH_PAGE_TOKEN_HOSTS = new Set([
  "graph.microsoft.com",
  "graph.microsoft.us",
  "dod-graph.microsoft.us",
  "graph.microsoft.de",
  "microsoftgraph.chinacloudapi.cn",
  "canary.graph.microsoft.com",
]);

const URL_PAGE_TOKEN_PATTERN = /^(?:[a-z][a-z\d+.-]*:)?\/\//i;
const SDK_EMBEDDED_URL_PATTERN = /https:\/\//i;

export function isAbsoluteUrlPageToken(pageToken?: string | null): boolean {
  return Boolean(
    pageToken &&
      (URL_PAGE_TOKEN_PATTERN.test(pageToken) ||
        SDK_EMBEDDED_URL_PATTERN.test(pageToken)),
  );
}

export function isAllowedMicrosoftGraphPageToken(
  pageToken?: string | null,
): boolean {
  if (!isAbsoluteUrlPageToken(pageToken)) return true;

  try {
    const url = new URL(pageToken!);

    return (
      url.protocol === "https:" &&
      MICROSOFT_GRAPH_PAGE_TOKEN_HOSTS.has(url.hostname.toLowerCase()) &&
      (!url.port || url.port === "443")
    );
  } catch {
    return false;
  }
}

// Returns the URL to pass to Microsoft Graph if `pageToken` is an @odata.nextLink,
// `null` for opaque continuation tokens, or throws if the token is an absolute URL
// pointing somewhere other than a Graph endpoint (SSRF guard).
export function resolveMicrosoftGraphNextLink(
  pageToken?: string | null,
): string | null {
  if (!isAllowedMicrosoftGraphPageToken(pageToken)) {
    throw new Error("Invalid Outlook page token");
  }
  if (pageToken?.startsWith("/v1.0/") || pageToken?.startsWith("/beta/")) {
    return `https://graph.microsoft.com${pageToken}`;
  }
  return isAbsoluteUrlPageToken(pageToken) ? pageToken! : null;
}

export const microsoftGraphPageTokenSchema = z
  .string()
  .nullish()
  .refine(isAllowedMicrosoftGraphPageToken, { message: "Invalid page token" });

/**
 * Detects whether an @odata.nextLink candidate from Microsoft Graph is non-advancing
 * (e.g. duplicate URL, non-increasing $skip offset, or unchanged $skiptoken),
 * preventing infinite pagination loops on large or exhausted mail folders.
 */
export function isNonAdvancingOutlookNextLink(
  currentUrl?: string | null,
  candidateUrl?: string | null,
): boolean {
  if (!candidateUrl) return true;
  if (!currentUrl) return false;
  if (currentUrl === candidateUrl) return true;

  try {
    const current = new URL(currentUrl, "https://graph.microsoft.com");
    const candidate = new URL(candidateUrl, "https://graph.microsoft.com");

    const currentSkip = Number(current.searchParams.get("$skip") ?? Number.NaN);
    const candidateSkip = Number(
      candidate.searchParams.get("$skip") ?? Number.NaN,
    );

    if (!Number.isNaN(currentSkip) && !Number.isNaN(candidateSkip)) {
      if (candidateSkip <= currentSkip) return true;
    }

    const currentSkiptoken = current.searchParams.get("$skiptoken");
    const candidateSkiptoken = candidate.searchParams.get("$skiptoken");
    if (
      currentSkiptoken &&
      candidateSkiptoken &&
      currentSkiptoken === candidateSkiptoken
    ) {
      return true;
    }
  } catch {
    return currentUrl === candidateUrl;
  }

  return false;
}
