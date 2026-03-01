const unsubscribeKeywords = [
  "unsubscribe",
  "email preferences",
  "email settings",
  "email options",
  "notification preferences",
];

export function containsUnsubscribeKeyword(text: string) {
  const lowerText = text.toLowerCase();
  return unsubscribeKeywords.some((keyword) => lowerText.includes(keyword));
}

// Patterns to detect unsubscribe URLs - checking for "unsub" catches:
// - "unsubscribe", "unsub", "unsub-email", "unsubscribed", etc.
// This helps with non-English emails where link text may not be in English
// but the URL often contains these patterns
const unsubscribeUrlPatterns = ["unsub", "opt-out", "optout", "list-manage"];

export function containsUnsubscribeUrlPattern(url: string) {
  const lowerUrl = url.toLowerCase();
  return unsubscribeUrlPatterns.some((pattern) => lowerUrl.includes(pattern));
}

export function cleanUnsubscribeLink(unsubscribeLink?: string | null) {
  if (!unsubscribeLink) return;

  let cleanedLink = unsubscribeLink.trim();
  if (cleanedLink.startsWith("<")) cleanedLink = cleanedLink.slice(1);
  if (cleanedLink.endsWith(">")) cleanedLink = cleanedLink.slice(0, -1);

  return cleanedLink.trim() || undefined;
}

export function parseListUnsubscribeHeader(
  listUnsubscribeHeader?: string | null,
) {
  if (!listUnsubscribeHeader) return [];

  const parts = listUnsubscribeHeader.match(/<[^>]+>|[^,]+/g) || [];
  return parts
    .map((part) => cleanUnsubscribeLink(part))
    .filter((part): part is string => Boolean(part));
}

export function getHttpUnsubscribeLink(options: {
  unsubscribeLink?: string | null;
  listUnsubscribeHeader?: string | null;
}) {
  const headerLinks = parseListUnsubscribeHeader(options.listUnsubscribeHeader);
  const fallbackLinks = parseListUnsubscribeHeader(options.unsubscribeLink);

  const allLinks = [...headerLinks, ...fallbackLinks];

  for (const link of allLinks) {
    if (isHttpLink(link)) return link;
  }

  return undefined;
}

function isHttpLink(link: string): boolean {
  try {
    const url = new URL(link);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}
