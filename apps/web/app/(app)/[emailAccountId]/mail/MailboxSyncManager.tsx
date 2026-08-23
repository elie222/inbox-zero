"use client";

import { useMailboxSync } from "@/app/(app)/[emailAccountId]/mail/use-mailbox-sync";
import { useAccounts } from "@/hooks/useAccounts";
import { useAccount } from "@/providers/EmailAccountProvider";

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
  useMailboxSync({ emailAccountId, enabled: true, priority });
  return null;
}
