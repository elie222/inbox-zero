"use client";

import { useEffect, useMemo, useState } from "react";
import type { MailClient } from "@inboxzero/mail-core/engine";
import type { MailPredicate } from "@inboxzero/mail-core/queries";
import { useOptionalMailClient } from "@inboxzero/mail-react/MailEngineProvider";
import { useMailboxWindow } from "@inboxzero/mail-react/use-mailbox-window";
import type { ListThread } from "@/app/(app)/[emailAccountId]/mail/types";
import type { CombinedListThread } from "@/utils/threads/load-combined";
import type { EmailLabels } from "@/providers/email-label-types";
import type { ThreadsQuery } from "@/utils/threads/validation";
import { conversationSummaryToListThread } from "@/utils/mail-engine/list-thread";
import { threadsQueryToConversationQuery } from "@/utils/mail-engine/threads-query";
import { isMetadataCoverageComplete } from "@/utils/mail-engine/coverage";

const EMPTY_THREADS: ListThread[] = [];

export function useEngineMailThreads({
  emailAccountId,
  accountIds,
  accounts,
  query,
  predicate,
  enabled = true,
}: {
  emailAccountId: string;
  accountIds?: string[];
  accounts?: Record<string, CombinedListThread["account"]>;
  query: ThreadsQuery;
  predicate?: MailPredicate;
  enabled?: boolean;
}) {
  const client = useOptionalMailClient();
  const resolvedAccountIds = useMemo(
    () => accountIds ?? [emailAccountId],
    [accountIds, emailAccountId],
  );
  const conversationQuery = useMemo(() => {
    const baseQuery = threadsQueryToConversationQuery({
      accountIds: resolvedAccountIds,
      query,
    });
    return predicate ? { ...baseQuery, predicate } : baseQuery;
  }, [resolvedAccountIds, query, predicate]);
  const mailbox = useMailboxWindow(conversationQuery, {
    client,
    enabled: enabled && Boolean(client),
  });
  const [failedAccountIds, setFailedAccountIds] = useState<string[]>([]);

  useEffect(() => {
    if (!client || !enabled) return;
    client.requestSync(resolvedAccountIds).catch(() => undefined);
  }, [client, enabled, resolvedAccountIds]);

  useEffect(() => {
    if (!client || !enabled) {
      setFailedAccountIds((current) => (current.length ? [] : current));
      return;
    }
    if (!mailbox.data?.connection || mailbox.data.connection === "ready") {
      setFailedAccountIds((current) => (current.length ? [] : current));
      return;
    }
    let cancelled = false;
    readFailedAccountIds(client, resolvedAccountIds).then((accountIds) => {
      if (!cancelled) setFailedAccountIds(accountIds);
    });
    return () => {
      cancelled = true;
    };
  }, [client, enabled, mailbox.data?.connection, resolvedAccountIds]);

  const threads = useMemo(() => {
    if (!client || !enabled) return EMPTY_THREADS;
    const conversations = mailbox.data?.conversations;
    if (!conversations?.length) return EMPTY_THREADS;
    return conversations.map((conversation) =>
      conversationSummaryToListThread(
        conversation,
        accounts?.[conversation.key.accountId],
      ),
    );
  }, [accounts, client, enabled, mailbox.data?.conversations]);

  return {
    threads,
    hasRemoteResponse: mailbox.status !== "loading",
    searchError: undefined,
    isLoading: enabled && Boolean(client) && mailbox.status === "loading",
    error: mailboxQueryError(mailbox.error),
    hasMore: mailbox.canLoadMore,
    isLoadingMore: mailbox.isLoadingMore,
    loadMore: mailbox.loadMore,
    coverageComplete: isMetadataCoverageComplete(mailbox.data?.coverage ?? []),
    failedAccountIds,
    labelsByAccount: {} as Record<string, EmailLabels>,
    refetch: async () => {
      await client?.requestSync(resolvedAccountIds);
    },
  };
}

export function useEngineMailClient(): MailClient | null {
  return useOptionalMailClient();
}

async function readFailedAccountIds(
  client: MailClient,
  accountIds: string[],
): Promise<string[]> {
  const diagnostics = await Promise.all(
    accountIds.map(async (accountId) => {
      try {
        return await client.getDiagnostics(accountId);
      } catch {
        return null;
      }
    }),
  );
  return diagnostics.flatMap((diagnostic, index) => {
    const accountId = accountIds[index];
    return diagnostic?.connection !== "ready" && accountId ? [accountId] : [];
  });
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
