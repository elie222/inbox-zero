"use client";

import { useEffect, useState } from "react";
import {
  getReplyDraftForSession,
  type ReplyDraftIdentity,
} from "@/utils/email-cache/reply-drafts";
import type { StoredReplyDraft } from "@/utils/email-cache/database";

export function useLocalReplyDraft(
  identity: ReplyDraftIdentity | undefined,
  legacyIdentity?: ReplyDraftIdentity,
  mode?: "reply" | "forward",
) {
  const key = identity
    ? JSON.stringify({ identity, legacyIdentity, mode })
    : "";
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
      legacyIdentity?: ReplyDraftIdentity;
      mode?: "reply" | "forward";
    };
    getReplyDraftForSession(
      identities.identity,
      identities.legacyIdentity,
      identities.mode,
    ).then(
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
