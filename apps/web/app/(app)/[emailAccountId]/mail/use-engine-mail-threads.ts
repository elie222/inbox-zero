"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { MailClient } from "@inboxzero/mail-core/engine";
import type {
  ConversationSummary,
  MailPredicate,
} from "@inboxzero/mail-core/queries";
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
const NO_LABELS_BY_ACCOUNT: Record<string, EmailLabels> = {};

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

  const previousThreads = useRef<PreviousThreads>({
    rows: new Map(),
    threads: EMPTY_THREADS,
  });
  const threads = useMemo(() => {
    if (!client || !enabled) return EMPTY_THREADS;
    const conversations = mailbox.data?.conversations;
    if (!conversations?.length) return EMPTY_THREADS;
    return reuseUnchangedThreads(
      previousThreads.current,
      conversations,
      accounts,
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
    labelsByAccount: NO_LABELS_BY_ACCOUNT,
    refetch: async () => {
      await client?.requestSync(resolvedAccountIds);
    },
  };
}

export function useEngineMailClient(): MailClient | null {
  return useOptionalMailClient();
}

type PreviousThreads = {
  rows: Map<
    string,
    {
      summary: string;
      account: CombinedListThread["account"] | undefined;
      thread: ListThread;
    }
  >;
  threads: ListThread[];
};

// Every pushed snapshot is freshly deserialized, so one changed conversation
// would otherwise hand every row a new object and re-render the whole list.
function reuseUnchangedThreads(
  previous: PreviousThreads,
  conversations: ConversationSummary[],
  accounts: Record<string, CombinedListThread["account"]> | undefined,
): ListThread[] {
  const rows: PreviousThreads["rows"] = new Map();
  const threads = conversations.map((conversation) => {
    const key = `${conversation.key.accountId}:${conversation.key.conversationId}`;
    const account = accounts?.[conversation.key.accountId];
    const summary = JSON.stringify(conversation);
    const cached = previous.rows.get(key);
    const thread =
      cached?.summary === summary && cached.account === account
        ? cached.thread
        : conversationSummaryToListThread(conversation, account);
    rows.set(key, { summary, account, thread });
    return thread;
  });
  const unchanged =
    threads.length === previous.threads.length &&
    threads.every((thread, index) => thread === previous.threads[index]);
  previous.rows = rows;
  if (!unchanged) previous.threads = threads;
  return previous.threads;
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
