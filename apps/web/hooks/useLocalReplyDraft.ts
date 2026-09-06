"use client";

import { useEffect, useState } from "react";
import {
  getReplyDraft,
  type ReplyDraftIdentity,
} from "@/utils/email-cache/reply-drafts";
import type { StoredReplyDraft } from "@/utils/email-cache/database";

export function useLocalReplyDraft(identity: ReplyDraftIdentity | undefined) {
  const key = identity ? JSON.stringify(identity) : "";
  const [loaded, setLoaded] = useState<{
    key: string;
    draft?: StoredReplyDraft;
    error?: Error;
  }>();
  useEffect(() => {
    if (!key) return;
    let cancelled = false;
    getReplyDraft(JSON.parse(key)).then(
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
