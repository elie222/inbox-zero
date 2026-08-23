"use client";

import { useMailboxSync } from "@/app/(app)/[emailAccountId]/mail/use-mailbox-sync";
import { useAccounts } from "@/hooks/useAccounts";

export function MailboxSyncManager() {
  const { data } = useAccounts();

  return (data?.emailAccounts ?? [])
    .filter((account) => !account.account.disconnectedAt)
    .map((account) => (
      <MailboxSync emailAccountId={account.id} key={account.id} />
    ));
}

function MailboxSync({ emailAccountId }: { emailAccountId: string }) {
  useMailboxSync({ emailAccountId, enabled: true });
  return null;
}
