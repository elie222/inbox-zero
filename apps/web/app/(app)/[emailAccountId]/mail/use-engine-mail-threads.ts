"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { MailClient } from "@inboxzero/mail-core/engine";
import { useOptionalMailClient } from "@inboxzero/mail-react/MailEngineProvider";
import type { ListThread } from "@/app/(app)/[emailAccountId]/mail/types";
import type { CombinedListThread } from "@/utils/threads/load-combined";
import type { EmailLabels } from "@/providers/email-label-types";
import type { ThreadsQuery } from "@/utils/threads/validation";
import { conversationSummaryToListThread } from "@/utils/mail-engine/list-thread";
import { threadsQueryToConversationQuery } from "@/utils/mail-engine/threads-query";
import { isMetadataCoverageComplete } from "@/utils/mail-engine/coverage";

export type OptimisticThreadUpdate = {
  threadIds: string[];
  commit: (threadId: string) => void;
  rollback: (threadIds: string[]) => void;
};

export function useEngineMailThreads({
  emailAccountId,
  accountIds,
  accounts,
  query,
  enabled = true,
}: {
  emailAccountId: string;
  accountIds?: string[];
  accounts?: Record<string, CombinedListThread["account"]>;
  query: ThreadsQuery;
  enabled?: boolean;
}) {
  const client = useOptionalMailClient();
  const resolvedAccountIds = useMemo(
    () => accountIds ?? [emailAccountId],
    [accountIds, emailAccountId],
  );
  const conversationQuery = useMemo(
    () =>
      threadsQueryToConversationQuery({
        accountIds: resolvedAccountIds,
        query,
      }),
    [resolvedAccountIds, query],
  );
  const [threads, setThreads] = useState<ListThread[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<
    { error: string; info: { error: string } } | undefined
  >();
  const [coverageComplete, setCoverageComplete] = useState(false);
  const [nextPage, setNextPage] = useState<string | null>(null);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  useEffect(() => {
    if (!client || !enabled) {
      setThreads([]);
      setIsLoading(false);
      setError(undefined);
      setCoverageComplete(false);
      setNextPage(null);
      return;
    }
    const handle = client.observeMailbox(conversationQuery);
    const applySnapshot = () => {
      const snapshot = handle.getSnapshot();
      setIsLoading(snapshot.status === "loading");
      setError(mailboxQueryError(snapshot.error));
      setThreads(
        (snapshot.data?.conversations ?? []).map((conversation) =>
          conversationSummaryToListThread(
            conversation,
            accounts?.[conversation.key.accountId],
          ),
        ),
      );
      setNextPage(snapshot.data?.nextPage ?? null);
      setCoverageComplete(
        isMetadataCoverageComplete(snapshot.data?.coverage ?? []),
      );
    };
    const unsubscribe = handle.subscribe(applySnapshot);
    applySnapshot();
    client.requestSync(resolvedAccountIds).catch(() => undefined);
    return () => {
      unsubscribe();
      handle.close();
    };
  }, [accounts, client, conversationQuery, enabled, resolvedAccountIds]);

  const loadMore = useCallback(() => {
    if (!client || !nextPage || isLoadingMore) return;
    setIsLoadingMore(true);
    const handle = client.observeMailbox({
      ...conversationQuery,
      after: nextPage,
    });
    let unsubscribe = () => {};
    const apply = () => {
      const snapshot = handle.getSnapshot();
      if (snapshot.status === "loading") return;
      setThreads((current) => [
        ...current,
        ...(snapshot.data?.conversations ?? []).map((conversation) =>
          conversationSummaryToListThread(
            conversation,
            accounts?.[conversation.key.accountId],
          ),
        ),
      ]);
      setNextPage(snapshot.data?.nextPage ?? null);
      setIsLoadingMore(false);
      unsubscribe();
      handle.close();
    };
    unsubscribe = handle.subscribe(apply);
    apply();
  }, [accounts, client, conversationQuery, isLoadingMore, nextPage]);

  return {
    threads,
    hasRemoteResponse: !isLoading,
    searchError: undefined,
    isLoading: enabled && isLoading,
    error,
    hasMore: Boolean(nextPage),
    isLoadingMore,
    loadMore,
    coverageComplete,
    failedAccountIds: [] as string[],
    labelsByAccount: {} as Record<string, EmailLabels>,
    optimisticallyUpdateThreads: (
      threadIds: string[],
      _updater: (thread: ListThread) => ListThread,
    ): OptimisticThreadUpdate => ({
      threadIds,
      commit: (_threadId: string) => undefined,
      rollback: (_threadIds: string[]) => undefined,
    }),
    refetch: async () => {
      await client?.requestSync(resolvedAccountIds);
    },
  };
}

export function useEngineMailClient(): MailClient | null {
  return useOptionalMailClient();
}

function mailboxQueryError(
  error: { code: string } | null,
): { error: string; info: { error: string } } | undefined {
  if (!error) return;
  return {
    error: "Couldn't load this mailbox.",
    info: { error: "Couldn't load this mailbox." },
  };
}
