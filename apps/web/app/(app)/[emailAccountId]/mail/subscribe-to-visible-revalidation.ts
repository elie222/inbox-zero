const DEFAULT_THROTTLE_MS = 10_000;

/**
 * Refetch after the user returns from another app (Gmail, Outlook, etc.).
 * Skips the initial visible load so the first SWR request is not doubled.
 */
export function subscribeToVisibleRevalidation(
  revalidate: () => void,
  throttleMs = DEFAULT_THROTTLE_MS,
) {
  let lastHiddenAt = 0;
  let lastRefetchAt = 0;

  const run = () => {
    if (document.visibilityState === "hidden") {
      lastHiddenAt = Date.now();
      return;
    }
    if (!lastHiddenAt) return;
    const now = Date.now();
    if (now - lastRefetchAt < throttleMs) return;
    lastHiddenAt = 0;
    lastRefetchAt = now;
    revalidate();
  };

  window.addEventListener("focus", run);
  document.addEventListener("visibilitychange", run);
  return () => {
    window.removeEventListener("focus", run);
    document.removeEventListener("visibilitychange", run);
  };
}
