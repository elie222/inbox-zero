"use client";

import { useEffect, useRef, useState } from "react";
import {
  dropReplyDraftDeletedFromMailbox,
  getReplyDraftForSession,
  type ReplyDraftIdentity,
  type StoredReplyDraft,
} from "@/utils/mail-engine/reply-drafts";

export function useLocalReplyDraft(
  identity: ReplyDraftIdentity | undefined,
  legacyIdentity?: ReplyDraftIdentity,
  mode?: "reply" | "forward",
) {
  // The legacy identity only seeds a draft that has none yet. It follows the
  // reply target, which changes when a sent reply's optimistic copy is
  // confirmed, and reloading then would remount the open composer.
  const key = identity ? JSON.stringify({ identity, mode }) : "";
  const legacyIdentityRef = useRef(legacyIdentity);
  legacyIdentityRef.current = legacyIdentity;
  const [loaded, setLoaded] = useState<{
    key: string;
    draft?: StoredReplyDraft;
    error?: Error;
  }>();
  useEffect(() => {
    if (!key) return;
    let cancelled = false;
    const identities = JSON.parse(key) as {
      identity: ReplyDraftIdentity;
      mode?: "reply" | "forward";
    };
    getReplyDraftForSession(
      identities.identity,
      legacyIdentityRef.current,
      identities.mode,
    )
      .then(dropReplyDraftDeletedFromMailbox)
      .then(
        (draft) => {
          if (!cancelled) setLoaded({ key, draft });
        },
        (error) => {
          if (!cancelled) setLoaded({ key, error });
        },
      );
    return () => {
      cancelled = true;
    };
  }, [key]);
  return {
    isLoading: Boolean(key && loaded?.key !== key),
    draft: loaded?.key === key ? loaded.draft : undefined,
    error: loaded?.key === key ? loaded.error : undefined,
  };
}
