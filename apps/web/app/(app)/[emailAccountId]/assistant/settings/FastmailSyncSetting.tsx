"use client";

import useSWR from "swr";
import type { FastmailSyncStatus } from "@/app/api/fastmail/status/route";
import { SettingCard } from "@/components/SettingCard";
import { FastmailSyncButton } from "@/components/FastmailSyncButton";
import { useAccount } from "@/providers/EmailAccountProvider";
import { isFastmailProvider } from "@/utils/email/provider-types";

export function FastmailSyncSetting() {
  const { provider } = useAccount();

  const { data } = useSWR<FastmailSyncStatus>(
    isFastmailProvider(provider) ? "/api/fastmail/status" : null,
    { refreshInterval: 30_000 },
  );

  // Only show for Fastmail accounts
  if (!isFastmailProvider(provider)) {
    return null;
  }

  return (
    <SettingCard
      title="Email Sync"
      description={`New mail syncs through the Fastmail event stream with polling recovery. ${data?.lastSuccessfulSync ? `Last successful check: ${new Date(data.lastSuccessfulSync).toLocaleString()}.` : "Waiting for the first successful check."} ${data?.pendingCount ? `${data.pendingCount} messages pending${data.failedCount ? ` (${data.failedCount} awaiting retry)` : ""}.` : ""}`}
      right={<FastmailSyncButton />}
    />
  );
}
