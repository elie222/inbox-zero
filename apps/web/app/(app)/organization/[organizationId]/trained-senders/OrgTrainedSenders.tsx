"use client";

import { useMemo } from "react";
import { TrainedSenders } from "@/app/(app)/[emailAccountId]/assistant/TrainedSenders";
import { AlertBasic } from "@/components/Alert";
import { LoadingContent } from "@/components/LoadingContent";
import { SectionHeader } from "@/components/Typography";
import { useAccounts } from "@/hooks/useAccounts";
import { useOrganizationMembers } from "@/hooks/useOrganizationMembers";

// One Trained senders table per mailbox in the organization. Only mailboxes the
// signed-in user owns are shown: the account-scoped APIs behind each table
// reject anyone else's.
// ponytail: other members' mailboxes would need org-scoped endpoints; add when
// an org has more than one person in it.
export function OrgTrainedSenders({
  organizationId,
}: {
  organizationId: string;
}) {
  const members = useOrganizationMembers(organizationId);
  const accounts = useAccounts();

  const mailboxes = useMemo(() => {
    const mine = new Set(accounts.data?.emailAccounts.map((a) => a.id));
    return (members.data?.members ?? [])
      .map((m) => m.emailAccount)
      .filter((account) => mine.has(account.id));
  }, [members.data, accounts.data]);

  return (
    <LoadingContent
      loading={members.isLoading || accounts.isLoading}
      error={members.error || accounts.error}
    >
      {mailboxes.length ? (
        <div className="space-y-8">
          {mailboxes.map((account) => (
            <section key={account.id}>
              <SectionHeader className="mb-2">{account.email}</SectionHeader>
              <TrainedSenders emailAccountId={account.id} />
            </section>
          ))}
        </div>
      ) : (
        <AlertBasic
          title="No mailboxes to show"
          description="Trained senders are listed for the organization members' mailboxes that belong to you."
        />
      )}
    </LoadingContent>
  );
}
