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
