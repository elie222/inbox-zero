import { useCallback, useInsertionEffect, useRef } from "react";

/**
 * An event handler whose identity never changes but which always runs the
 * latest closure. Handlers that close over list or reader state would
 * otherwise re-render every memoized child they are passed to on each
 * keypress or engine snapshot. Not for use during render.
 */
export function useStableCallback<Args extends unknown[], Result>(
  callback: (...args: Args) => Result,
) {
  const latest = useRef(callback);
  useInsertionEffect(() => {
    latest.current = callback;
  });
  return useCallback((...args: Args) => latest.current(...args), []);
}
