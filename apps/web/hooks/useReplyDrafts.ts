"use client";

import { useEffect } from "react";
import useSWR from "swr";
import { useOptionalMailClient } from "@inboxzero/mail-react/MailEngineProvider";
import { getActiveMailClient } from "@/utils/mail-engine/active-client";
import {
  getReplyDrafts,
  subscribeToReplyDrafts,
} from "@/utils/mail-engine/reply-drafts";

export function useReplyDrafts(
  emailAccountId: string,
  threadId: string,
  messageIds: string[],
) {
  // Saved drafts are read from the engine, so look again once it has started.
  const engineReady = Boolean(useOptionalMailClient() ?? getActiveMailClient());
  const { data, error, isLoading, mutate } = useSWR(
    [
      "local-reply-drafts",
      emailAccountId,
      threadId,
      messageIds.join(","),
      engineReady,
    ],
    () => getReplyDrafts(emailAccountId, threadId, messageIds),
  );
  useEffect(
    () =>
      subscribeToReplyDrafts((scope) => {
        if (
          scope.emailAccountId === emailAccountId &&
          scope.threadId === threadId
        )
          mutate();
      }),
    [emailAccountId, threadId, mutate],
  );
  return { drafts: data ?? [], error, isLoading };
}
