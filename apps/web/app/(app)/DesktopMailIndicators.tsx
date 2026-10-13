"use client";

import { useEffect } from "react";
import { useOptionalMailClient } from "@inboxzero/mail-react/MailEngineProvider";
import { useAccount } from "@/providers/EmailAccountProvider";
import { getInboxZeroDesktopApp } from "@/utils/desktop-app";

export function DesktopMailIndicators() {
  const client = useOptionalMailClient();
  const { emailAccountId, emailAccount } = useAccount();
  const accountId =
    emailAccount && !emailAccount.account.disconnectedAt
      ? emailAccountId
      : null;

  useEffect(() => {
    const desktop = getInboxZeroDesktopApp();
    if (!desktop?.setUnreadCount) return;
    if (!client || !accountId) {
      desktop.setUnreadCount(0);
      return;
    }

    const handle = client.observeMailboxCounts({
      accountIds: [accountId],
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
  }, [accountId, client]);

  return null;
}
