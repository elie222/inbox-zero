/**
 * Gmail ID utilities
 */

/**
 * Extract Gmail ID from a Gmail URL
 * @param url - Gmail URL
 * @returns Gmail ID (either URL format or API format, depending on what's in the URL)
 */
export function extractGmailIdFromUrl(url: string): string | null {
  // Match pattern: #label/ID or #search/query/ID
  const match = url.match(/#[^/]+\/([A-Za-z0-9_-]+)/);
  return match ? match[1] : null;
}
