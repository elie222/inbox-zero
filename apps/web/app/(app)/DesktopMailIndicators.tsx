"use client";

import { useEffect } from "react";
import { useOptionalMailClient } from "@inboxzero/mail-react/MailEngineProvider";
import { useAccounts } from "@/hooks/useAccounts";
import { getInboxZeroDesktopApp } from "@/utils/desktop-app";

const MAX_INDICATOR_ACCOUNTS = 50;

export function DesktopMailIndicators() {
  const client = useOptionalMailClient();
  const { data } = useAccounts();
  const accountIds = JSON.stringify(
    (data?.emailAccounts ?? [])
      .filter((account) => !account.account.disconnectedAt)
      .map((account) => account.id)
      .sort()
      .slice(0, MAX_INDICATOR_ACCOUNTS),
  );

  useEffect(() => {
    const desktop = getInboxZeroDesktopApp();
    if (!desktop?.setUnreadCount) return;
    const ids: string[] = JSON.parse(accountIds);
    if (!client || ids.length === 0) {
      desktop.setUnreadCount(0);
      return;
    }

    const handle = client.observeMailboxCounts({
      accountIds: ids,
      targets: [{ id: "INBOX", predicate: { kind: "role", role: "inbox" } }],
    });
    const apply = () => {
      desktop.setUnreadCount?.(
        handle.getSnapshot().data?.counts[0]?.unreadConversations ?? 0,
      );
    };
    const unsubscribe = handle.subscribe(apply);
    apply();
    return () => {
      unsubscribe();
      handle.close();
      desktop.setUnreadCount?.(0);
    };
  }, [accountIds, client]);

  return null;
}
