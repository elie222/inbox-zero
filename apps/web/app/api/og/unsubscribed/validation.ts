export const MIN_UNSUBSCRIBED_COUNT = 1;
export const MAX_UNSUBSCRIBED_COUNT = 10_000;

// `count` comes from an unauthenticated query param, so reject anything that
// isn't a plain integer and clamp the rest into a sane range.
export function parseUnsubscribedCount(raw: string | null): number | null {
  if (!raw) return null;
  if (!/^\d+$/.test(raw.trim())) return null;

  const parsed = Number.parseInt(raw, 10);
  if (!Number.isSafeInteger(parsed)) return null;

  return Math.min(
    Math.max(parsed, MIN_UNSUBSCRIBED_COUNT),
    MAX_UNSUBSCRIBED_COUNT,
  );
}
