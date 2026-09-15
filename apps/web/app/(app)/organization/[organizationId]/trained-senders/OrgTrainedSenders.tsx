"use client";

import { TrainedSenders } from "@/app/(app)/[emailAccountId]/assistant/TrainedSenders";

// One list across every mailbox of yours in the organization.
export function OrgTrainedSenders({
  organizationId,
}: {
  organizationId: string;
}) {
  return (
    <TrainedSenders
      url={`/api/user/trained-senders/all?organizationId=${organizationId}`}
    />
  );
}
