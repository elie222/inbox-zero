"use client";

import { AlertCircleIcon, ClockIcon, LoaderCircleIcon } from "lucide-react";
import type { UpcomingScheduledEmailsResponse } from "@/app/api/user/scheduled-emails/route";
import { InlineActionButton } from "@/components/InlineActionButton";
import { LoadingContent } from "@/components/LoadingContent";
import { useScheduledEmailActions } from "@/hooks/useScheduledEmailActions";
import { useAccount } from "@/providers/EmailAccountProvider";
import { prefixPath } from "@/utils/path";
import { useUpcomingScheduledEmails } from "@/hooks/useHiddenDraftMessageIds";

type ScheduledEmail =
  UpcomingScheduledEmailsResponse["scheduledEmails"][number];

export function ScheduledEmailList() {
  const { emailAccountId } = useAccount();
  const { data, isLoading, error } = useUpcomingScheduledEmails(emailAccountId);
  const { cancelSend, retrySend } = useScheduledEmailActions(emailAccountId);

  const rows = data?.scheduledEmails ?? [];

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
        <LoadingContent loading={isLoading} error={error}>
          {rows.length === 0 ? (
            <div className="px-6 py-12 text-center text-muted-foreground text-sm">
              Nothing scheduled. Emails you send later show up here until
              they&apos;re on their way.
            </div>
          ) : (
            <ul aria-label="Scheduled emails">
              {rows.map((row) => (
                <li
                  key={row.id}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1 border-border border-b px-4 py-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-foreground text-sm">
                      {row.subject?.trim() || "(no subject)"}
                    </p>
                    <p className="truncate text-muted-foreground text-xs">
                      {row.to?.trim() || "No recipient"}
                    </p>
                  </div>
                  <p
                    role="status"
                    className="flex shrink-0 items-center gap-2 text-muted-foreground text-xs"
                  >
                    <StatusIcon status={row.status} />
                    {statusLabel(row)}
                  </p>
                  <div className="flex shrink-0 gap-2">
                    {["PENDING", "BLOCKED_AUTH", "FAILED"].includes(
                      row.status,
                    ) && (
                      <InlineActionButton onClick={() => cancelSend(row.id)}>
                        Cancel send
                      </InlineActionButton>
                    )}
                    {row.status === "UNCERTAIN" && (
                      // Neither cancel nor retry accepts an uncertain row, so
                      // this is the only way to resolve one.
                      <a
                        className="text-xs underline underline-offset-4"
                        href={prefixPath(emailAccountId, "/mail?type=sent")}
                      >
                        Check Sent
                      </a>
                    )}
                    {["BLOCKED_AUTH", "FAILED"].includes(row.status) && (
                      <InlineActionButton onClick={() => retrySend(row.id)}>
                        Retry send
                      </InlineActionButton>
                    )}
                  </div>
                  {row.error && (
                    <p className="basis-full text-destructive text-xs">
                      {row.error}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </LoadingContent>
      </div>
    </div>
  );
}

function StatusIcon({ status }: { status: ScheduledEmail["status"] }) {
  if (status === "PROCESSING")
    return <LoaderCircleIcon className="size-3.5 animate-spin" />;
  if (status === "PENDING") return <ClockIcon className="size-3.5" />;
  return <AlertCircleIcon className="size-3.5 text-destructive" />;
}

function statusLabel(row: ScheduledEmail) {
  switch (row.status) {
    case "PENDING":
      return formatTime(row.sendAt);
    case "PROCESSING":
      return "Sending…";
    case "UNCERTAIN":
      return "Couldn't confirm delivery";
    case "BLOCKED_AUTH":
      return "Reconnect your account to send this";
    default:
      return "Needs attention";
  }
}

function formatTime(value: string | Date) {
  return new Date(value).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
