"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  createReplyDraftWriter,
  type ReplyDraftContent,
  type ReplyDraftIdentity,
} from "@/utils/email-cache/reply-drafts";

type DraftDeliveryTimes = { sendAt?: string; remindAt?: string };

export function useReplyDraftPersistence({
  identity,
  initialRevision,
  loadError,
  getContent,
}: {
  identity?: ReplyDraftIdentity;
  initialRevision?: number;
  loadError?: Error;
  getContent: (
    deliveryTimes?: DraftDeliveryTimes,
  ) => ReplyDraftContent | undefined;
}) {
  const [saveError, setSaveError] = useState(loadError?.message ?? "");
  const [writer] = useState(() =>
    identity ? createReplyDraftWriter(identity, initialRevision) : undefined,
  );
  const stopped = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const latest = useRef<ReplyDraftContent | undefined>(undefined);
  const latestSnapshot = useRef<string | undefined>(undefined);
  const queuedSnapshot = useRef<string | undefined>(undefined);
  const mounted = useRef(true);
  const getContentRef = useRef(getContent);
  getContentRef.current = getContent;

  const flush = useCallback(async () => {
    clearTimeout(timer.current);
    const content = latest.current;
    const snapshot = latestSnapshot.current;
    if (!content || !snapshot || !writer || stopped.current) return;
    if (snapshot === queuedSnapshot.current) return;

    queuedSnapshot.current = snapshot;
    try {
      await writer.save(content);
      if (
        mounted.current &&
        !stopped.current &&
        latestSnapshot.current === snapshot
      ) {
        setSaveError("");
      }
    } catch (error) {
      if (queuedSnapshot.current === snapshot)
        queuedSnapshot.current = undefined;
      if (mounted.current) {
        setSaveError(
          error instanceof Error
            ? error.message
            : "Could not save draft on this device.",
        );
      }
    }
  }, [writer]);

  const capture = useCallback(
    (deliveryTimes?: DraftDeliveryTimes) => {
      if (!writer || stopped.current) return;
      const content = getContentRef.current(deliveryTimes);
      if (!content) return;
      const snapshot = getReplyDraftSnapshot(content);
      if (
        snapshot === latestSnapshot.current &&
        snapshot === queuedSnapshot.current
      )
        return;

      latest.current = content;
      latestSnapshot.current = snapshot;
      clearTimeout(timer.current);
      timer.current = setTimeout(() => flush().catch(() => {}), 300);
    },
    [flush, writer],
  );

  const clear = useCallback(async () => {
    stopped.current = true;
    clearTimeout(timer.current);
    try {
      await writer?.clear();
    } catch (error) {
      stopped.current = false;
      if (mounted.current) {
        setSaveError(
          error instanceof Error
            ? error.message
            : "Could not discard this draft.",
        );
      }
      throw error;
    }
  }, [writer]);

  useEffect(() => {
    const flushWhenHidden = () => {
      if (document.visibilityState === "hidden") flush().catch(() => {});
    };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", flushWhenHidden);
    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", flushWhenHidden);
      flush().catch(() => {});
    };
  }, [flush]);

  useEffect(
    () => () => {
      mounted.current = false;
    },
    [],
  );

  return { capture, clear, flush, saveError };
}

function getReplyDraftSnapshot(content: ReplyDraftContent) {
  return JSON.stringify({
    ...content,
    attachments: content.attachments.map(
      ({ contentBase64: _content, ...metadata }) => metadata,
    ),
  });
}
