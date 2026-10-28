const DEFAULT_THROTTLE_MS = 10_000;

/**
 * Refetch after the user returns from another app (Gmail, Outlook, etc.).
 * Skips the initial visible load so the first SWR request is not doubled.
 */
export function subscribeToVisibleRevalidation(
  revalidate: () => unknown,
  throttleMs = DEFAULT_THROTTLE_MS,
) {
  let lastHiddenAt = 0;
  let lastRefetchAt = 0;
  let inFlight = false;

  const run = () => {
    if (document.visibilityState === "hidden") {
      lastHiddenAt = Date.now();
      return;
    }
    if (!lastHiddenAt || inFlight) return;
    const now = Date.now();
    if (now - lastRefetchAt < throttleMs) return;

    const hiddenAt = lastHiddenAt;
    inFlight = true;
    Promise.resolve()
      .then(() => revalidate())
      .then(() => {
        lastRefetchAt = Date.now();
        if (lastHiddenAt === hiddenAt) {
          lastHiddenAt = 0;
        }
      })
      .catch(() => {
        // Keep lastHiddenAt so a later focus/visible event can retry.
      })
      .finally(() => {
        inFlight = false;
      });
  };

  window.addEventListener("focus", run);
  document.addEventListener("visibilitychange", run);
  return () => {
    window.removeEventListener("focus", run);
    document.removeEventListener("visibilitychange", run);
  };
}
