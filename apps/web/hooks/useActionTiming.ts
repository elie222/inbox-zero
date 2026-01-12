import { useRef, useCallback } from "react";

export function useActionTiming() {
  const startTimeRef = useRef<number | null>(null);

  const start = useCallback(() => {
    startTimeRef.current = Date.now();
  }, []);

  const getElapsedMs = useCallback(() => {
    if (!startTimeRef.current) return 0;
    return Date.now() - startTimeRef.current;
  }, []);

  return { start, getElapsedMs };
}
