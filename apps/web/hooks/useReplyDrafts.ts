"use client";

import { useEffect } from "react";
import useSWR from "swr";
import {
  getReplyDrafts,
  subscribeToReplyDrafts,
} from "@/utils/email-cache/reply-drafts";

export function useReplyDrafts(emailAccountId: string, threadId: string) {
  const { data, error, isLoading, mutate } = useSWR(
    ["local-reply-drafts", emailAccountId, threadId],
    () => getReplyDrafts(emailAccountId, threadId),
  );
  useEffect(
    () =>
      subscribeToReplyDrafts(() => {
        mutate();
      }),
    [mutate],
  );
  return { drafts: data ?? [], error, isLoading };
}
