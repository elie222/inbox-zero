export const DIGEST_MAX_ITEMS_PER_RULE = 5;

export function formatDigestDate(date: Date) {
  return date.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}
