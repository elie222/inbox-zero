"use client";

import { useMemo } from "react";
import { useEngineMailThreads } from "@/app/(app)/[emailAccountId]/mail/use-engine-mail-threads";
import type { CombinedListThread } from "@/utils/threads/load-combined";
import type { ThreadsQuery } from "@/utils/threads/validation";

export function useCombinedMailThreads({
  accounts,
  emailAccountId,
  enabled,
  isUnread,
  searchQuery,
}: {
  accounts: CombinedListThread["account"][];
  emailAccountId: string;
  enabled: boolean;
  isUnread: boolean;
  labelNames?: string[];
  searchQuery?: string;
}) {
  const accountIds = useMemo(
    () => accounts.map((account) => account.id),
    [accounts],
  );
  const accountsById = useMemo(
    () => Object.fromEntries(accounts.map((account) => [account.id, account])),
    [accounts],
  );
  const query = useMemo<ThreadsQuery>(() => {
    if (searchQuery) return { q: searchQuery };
    if (isUnread) return { type: "unread" };
    return { type: "inbox" };
  }, [isUnread, searchQuery]);
  return useEngineMailThreads({
    emailAccountId,
    accountIds: accountIds.length ? accountIds : [emailAccountId],
    accounts: accountsById,
    query,
    enabled,
  });
}
