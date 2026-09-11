export const EMAIL_CACHE_MEASURES = {
  listHydration: "inbox-zero:email-cache:list-hydration",
  threadHydration: "inbox-zero:email-cache:thread-hydration",
} as const;

export function startEmailCacheMeasure() {
  return typeof performance === "undefined" ? undefined : performance.now();
}

export function finishEmailCacheMeasure(
  name: (typeof EMAIL_CACHE_MEASURES)[keyof typeof EMAIL_CACHE_MEASURES],
  start: number | undefined,
) {
  if (start === undefined || typeof performance === "undefined") return;
  performance.measure(name, { start, end: performance.now() });
}
