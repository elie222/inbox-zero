"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export function useProviderDraftAutosave<T>({
  enabled,
  getContent,
  save,
}: {
  enabled: boolean;
  getContent: () => T | undefined;
  save: (content: T) => Promise<void>;
}) {
  const [error, setError] = useState("");
  const latest = useRef({ enabled, getContent, save });
  latest.current = { enabled, getContent, save };
  const pending = useRef<T | undefined>(undefined);
  const saved = useRef<string | undefined>(undefined);
  const active = useRef<Promise<void> | undefined>(undefined);
  const paused = useRef(false);
  const mounted = useRef(true);

  const capture = useCallback(() => {
    if (latest.current.enabled && !paused.current)
      pending.current = latest.current.getContent();
  }, []);

  const flush = useCallback(() => {
    if (active.current) return active.current;
    const content = pending.current;
    if (!latest.current.enabled || paused.current || content === undefined)
      return Promise.resolve();
    const snapshot = JSON.stringify(content);
    if (snapshot === saved.current) return Promise.resolve();
    const request = Promise.resolve()
      .then(() => latest.current.save(content))
      .then(() => {
        saved.current = snapshot;
        if (mounted.current) setError("");
      })
      .catch((error: unknown) => {
        if (mounted.current)
          setError(
            error instanceof Error
              ? error.message
              : "Could not sync draft to your mailbox. Retrying…",
          );
      })
      .finally(() => {
        active.current = undefined;
      });
    active.current = request;
    return request;
  }, []);

  const stop = useCallback(async () => {
    paused.current = true;
    await active.current;
  }, []);
  const resume = useCallback(() => {
    paused.current = false;
    capture();
  }, [capture]);

  useEffect(() => {
    mounted.current = true;
    const timer = setInterval(flush, 3000);
    const onHidden = () => {
      if (document.visibilityState === "hidden") flush();
    };
    document.addEventListener("visibilitychange", onHidden);
    window.addEventListener("online", flush);
    return () => {
      mounted.current = false;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onHidden);
      window.removeEventListener("online", flush);
      if (active.current) active.current.then(flush);
      else flush();
    };
  }, [flush]);

  return { capture, stop, resume, error };
}
