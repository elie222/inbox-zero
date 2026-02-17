"use client";

import { useCallback, useState } from "react";
import { CopyIcon, CheckIcon } from "lucide-react";
import useSWR from "swr";
import { LoadingContent } from "@/components/LoadingContent";
import { PageWrapper } from "@/components/PageWrapper";
import { PageHeading } from "@/components/Typography";
import { Button } from "@/components/ui/button";
import type { DebugFollowUpResponse } from "@/app/api/user/debug/follow-up/route";
import { useAccount } from "@/providers/EmailAccountProvider";

export default function DebugFollowUpPage() {
  const { emailAccountId } = useAccount();
  // Keep this account-scoped: useOrgSWR is for endpoints that support org-admin access.
  const { data, isLoading, error } = useSWR<DebugFollowUpResponse>(
    emailAccountId ? ["/api/user/debug/follow-up", emailAccountId] : null,
  );
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    if (!data) return;
    navigator.clipboard.writeText(JSON.stringify(data, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [data]);

  return (
    <PageWrapper>
      <PageHeading>Follow-up Debug</PageHeading>

      <LoadingContent loading={isLoading} error={error}>
        <div className="mt-6 space-y-6">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <DebugStat
              label="Awaiting Reply (days)"
              value={data?.emailAccount.followUpAwaitingReplyDays ?? "Off"}
            />
            <DebugStat
              label="Needs Reply (days)"
              value={data?.emailAccount.followUpNeedsReplyDays ?? "Off"}
            />
            <DebugStat
              label="Auto Draft"
              value={data?.emailAccount.followUpAutoDraftEnabled ? "On" : "Off"}
            />
            <DebugStat
              label="Unresolved Trackers"
              value={data?.summary.unresolvedTrackers ?? 0}
            />
            <DebugStat
              label="Unresolved + Applied"
              value={data?.summary.unresolvedWithFollowUpApplied ?? 0}
            />
            <DebugStat
              label="Unresolved + Draft"
              value={data?.summary.unresolvedWithFollowUpDraft ?? 0}
            />
          </div>

          <div className="rounded-lg border p-4 text-sm">
            <p>
              <span className="font-medium">Last Follow-up Applied:</span>{" "}
              {formatDate(data?.summary.lastFollowUpAppliedAt)}
            </p>
            <p className="mt-2">
              <span className="font-medium">Last Tracker Activity:</span>{" "}
              {formatDate(data?.summary.lastTrackerActivityAt)}
            </p>
            <p className="mt-2 text-muted-foreground">
              Last tracker activity is a proxy for follow-up processing activity.
            </p>
          </div>

          <div className="flex justify-end">
            <Button variant="outline" size="sm" onClick={handleCopy} disabled={!data}>
              {copied ? (
                <CheckIcon className="mr-2 h-4 w-4" />
              ) : (
                <CopyIcon className="mr-2 h-4 w-4" />
              )}
              {copied ? "Copied" : "Copy JSON"}
            </Button>
          </div>

          <div className="rounded-lg border bg-muted/50 p-4">
            <pre className="overflow-auto text-sm">
              {data ? JSON.stringify(data, null, 2) : "Loading..."}
            </pre>
          </div>
        </div>
      </LoadingContent>
    </PageWrapper>
  );
}

function DebugStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-medium">{value}</p>
    </div>
  );
}

function formatDate(value: Date | string | null | undefined) {
  if (!value) return "Never";
  const date = typeof value === "string" ? new Date(value) : value;
  return date.toISOString();
}
