"use client";

import { useEffect, useMemo, useState } from "react";
import type { MailClient } from "@inboxzero/mail-core/engine";
import { useOptionalMailClient } from "@inboxzero/mail-react/MailEngineProvider";
import type { ListThread } from "@/app/(app)/[emailAccountId]/mail/types";
import type { ThreadsQuery } from "@/utils/threads/validation";
import { conversationSummaryToListThread } from "@/utils/mail-engine/list-thread";
import { threadsQueryToConversationQuery } from "@/utils/mail-engine/threads-query";

export function useEngineMailThreads({
  emailAccountId,
  query,
  enabled = true,
}: {
  emailAccountId: string;
  query: ThreadsQuery;
  enabled?: boolean;
}) {
  const client = useOptionalMailClient();
  const conversationQuery = useMemo(
    () =>
      threadsQueryToConversationQuery({
        accountIds: [emailAccountId],
        query,
      }),
    [emailAccountId, query],
  );
  const [threads, setThreads] = useState<ListThread[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [coverageComplete, setCoverageComplete] = useState(false);

  useEffect(() => {
    if (!client || !enabled) {
      setThreads([]);
      setIsLoading(false);
      setCoverageComplete(false);
      return;
    }
    const handle = client.observeMailbox(conversationQuery);
    const applySnapshot = () => {
      const snapshot = handle.getSnapshot();
      setIsLoading(snapshot.status === "loading");
      setThreads(
        (snapshot.data?.conversations ?? []).map(
          conversationSummaryToListThread,
        ),
      );
      setCoverageComplete(
        (snapshot.data?.coverage ?? []).some(
          (item) => item.metadata === "complete",
        ),
      );
    };
    const unsubscribe = handle.subscribe(applySnapshot);
    applySnapshot();
    client.requestSync([emailAccountId]).catch(() => undefined);
    return () => {
      unsubscribe();
      handle.close();
    };
  }, [client, conversationQuery, emailAccountId, enabled]);

  return {
    threads,
    hasRemoteResponse: !isLoading,
    searchError: undefined,
    isLoading: enabled && isLoading,
    error: undefined,
    hasMore: false,
    isLoadingMore: false,
    loadMore: () => {},
    coverageComplete,
    optimisticallyUpdateThreads: (
      threadIds: string[],
      _updater: (thread: ListThread) => ListThread,
    ) => ({
      threadIds,
      commit: (_threadId: string) => undefined,
      rollback: (_threadIds: string[]) => undefined,
    }),
    refetch: async () => {
      await client?.requestSync([emailAccountId]);
    },
  };
}

export function useEngineMailClient(): MailClient | null {
  return useOptionalMailClient();
}
