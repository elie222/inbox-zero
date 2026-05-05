import { z } from "zod";

const MICROSOFT_GRAPH_PAGE_TOKEN_HOSTS = new Set([
  "graph.microsoft.com",
  "graph.microsoft.us",
  "dod-graph.microsoft.us",
  "graph.microsoft.de",
  "microsoftgraph.chinacloudapi.cn",
]);

const URL_PAGE_TOKEN_PATTERN = /^(?:[a-z][a-z\d+.-]*:)?\/\//i;

export function isAbsoluteUrlPageToken(pageToken?: string | null): boolean {
  return Boolean(pageToken && URL_PAGE_TOKEN_PATTERN.test(pageToken));
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
  if (!isAbsoluteUrlPageToken(pageToken)) return null;
  if (!isAllowedMicrosoftGraphPageToken(pageToken)) {
    throw new Error("Invalid Outlook page token");
  }
  return pageToken!;
}

export const microsoftGraphPageTokenSchema = z
  .string()
  .nullish()
  .refine(isAllowedMicrosoftGraphPageToken, { message: "Invalid page token" });
