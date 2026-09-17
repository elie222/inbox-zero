"use client";

import { useSyncExternalStore } from "react";
import {
  isMailSyncActivated,
  subscribeToMailActivation,
} from "@/utils/email-cache/mail-activation";
import { useAccounts } from "@/hooks/useAccounts";
import { useAccount } from "@/providers/EmailAccountProvider";
import { useMailboxSync } from "@/app/(app)/[emailAccountId]/mail/use-mailbox-sync";

export function MailboxSyncManager() {
  const { data } = useAccounts();
  const { emailAccountId: activeEmailAccountId } = useAccount();

  return (data?.emailAccounts ?? [])
    .filter((account) => !account.account.disconnectedAt)
    .sort(
      (left, right) =>
        Number(right.id === activeEmailAccountId) -
        Number(left.id === activeEmailAccountId),
    )
    .map((account) => (
      <MailboxSync
        emailAccountId={account.id}
        key={account.id}
        priority={account.id === activeEmailAccountId}
      />
    ));
}

function MailboxSync({
  emailAccountId,
  priority,
}: {
  emailAccountId: string;
  priority: boolean;
}) {
  const enabled = useSyncExternalStore(
    subscribeToMailActivation,
    () => isMailSyncActivated(emailAccountId),
    () => false,
  );
  useMailboxSync({ emailAccountId, enabled, priority });
  return null;
}
