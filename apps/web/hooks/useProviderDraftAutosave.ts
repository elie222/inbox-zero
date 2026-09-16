"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const sessions = new Map<
  string,
  { cancel: () => void; active?: Promise<void> }
>();

export function useProviderDraftAutosave<T>({
  enabled,
  sessionKey,
  getContent,
  save,
}: {
  enabled: boolean;
  sessionKey?: string;
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
  const cleanup = useRef<() => void>(() => {});

  const capture = useCallback(() => {
    if (latest.current.enabled && !paused.current)
      pending.current = latest.current.getContent();
  }, []);

  const flush = useCallback(() => {
    if (active.current) return active.current;
    if (!navigator.onLine) return Promise.resolve();
    const content = pending.current;
    if (!latest.current.enabled || paused.current || content === undefined)
      return Promise.resolve();
    const snapshot = JSON.stringify(content);
    if (snapshot === saved.current) return Promise.resolve();
    const session = sessionKey ? sessions.get(sessionKey) : undefined;
    const request = Promise.resolve(session?.active)
      .then(() => {
        if (paused.current) return;
        return latest.current.save(content);
      })
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
        if (session?.active === request) session.active = undefined;
        if (
          !mounted.current &&
          (paused.current || JSON.stringify(pending.current) === saved.current)
        )
          cleanup.current();
      });
    active.current = request;
    if (session) session.active = request;
    return request;
  }, [sessionKey]);

  const stop = useCallback(async () => {
    paused.current = true;
    await active.current;
    if (sessionKey) await sessions.get(sessionKey)?.active;
  }, [sessionKey]);
  const resume = useCallback(() => {
    paused.current = false;
    capture();
  }, [capture]);

  useEffect(() => {
    mounted.current = true;
    paused.current = false;
    const previous = sessionKey ? sessions.get(sessionKey) : undefined;
    previous?.cancel();
    const session = {
      cancel: () => {
        paused.current = true;
        cleanup.current();
      },
      active: previous?.active,
    };
    if (sessionKey) sessions.set(sessionKey, session);
    const timer = setInterval(flush, 3000);
    const flushLatest = () =>
      active.current ? active.current.then(flush) : flush();
    const onHidden = () => {
      if (document.visibilityState === "hidden") flushLatest();
    };
    document.addEventListener("visibilitychange", onHidden);
    window.addEventListener("online", flushLatest);
    cleanup.current = () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onHidden);
      window.removeEventListener("online", flushLatest);
      if (sessionKey && sessions.get(sessionKey) === session)
        sessions.delete(sessionKey);
    };
    return () => {
      mounted.current = false;
      if (
        !sessionKey ||
        paused.current ||
        pending.current === undefined ||
        JSON.stringify(pending.current) === saved.current
      )
        cleanup.current();
      flushLatest();
    };
  }, [flush, sessionKey]);

  return { capture, stop, resume, error };
}
