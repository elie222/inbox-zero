"use client";

import { useState } from "react";
import useSWR from "swr";
import { AlertCircleIcon, ClockIcon, LoaderCircleIcon } from "lucide-react";
import type { UpcomingScheduledEmailsResponse } from "@/app/api/user/scheduled-emails/route";
import { InlineActionButton } from "@/components/InlineActionButton";
import { LoadingContent } from "@/components/LoadingContent";
import {
  cancelScheduledEmailAction,
  retryScheduledEmailAction,
} from "@/utils/actions/scheduled-email";
import { getActionErrorMessage } from "@/utils/error";
import { useAccount } from "@/providers/EmailAccountProvider";

type ScheduledEmail =
  UpcomingScheduledEmailsResponse["scheduledEmails"][number];

export function ScheduledEmailList() {
  const { emailAccountId } = useAccount();
  const [actionError, setActionError] = useState("");
  const [busy, setBusy] = useState(false);
  const { data, isLoading, error, mutate } =
    useSWR<UpcomingScheduledEmailsResponse>(
      ["/api/user/scheduled-emails", emailAccountId],
      {
        refreshInterval: (current) => {
          const rows = current?.scheduledEmails ?? [];
          if (rows.some((row) => row.status === "PROCESSING")) return 5000;
          const dueTimes = rows
            .filter((row) => row.status === "PENDING")
            .map((row) => new Date(row.sendAt).getTime());
          return dueTimes.length
            ? Math.min(
                60_000,
                Math.max(5000, Math.min(...dueTimes) - Date.now()),
              )
            : 0;
        },
      },
    );

  const runScheduledAction = async (
    action: typeof cancelScheduledEmailAction,
    id: string,
  ) => {
    const result = await action(emailAccountId, { id });
    if (result?.serverError || result?.validationErrors)
      throw new Error(getActionErrorMessage(result));
  };

  const act = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setActionError("");
    try {
      await action();
      await mutate();
    } catch (failure) {
      setActionError(
        failure instanceof Error ? failure.message : "Something went wrong",
      );
    } finally {
      setBusy(false);
    }
  };

  const rows = data?.scheduledEmails ?? [];

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      {actionError && (
        <p role="alert" className="px-4 py-2 text-destructive text-xs">
          {actionError}
        </p>
      )}
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
                      <InlineActionButton
                        disabled={busy}
                        onClick={() =>
                          act(() =>
                            runScheduledAction(
                              cancelScheduledEmailAction,
                              row.id,
                            ),
                          )
                        }
                      >
                        Cancel send
                      </InlineActionButton>
                    )}
                    {["BLOCKED_AUTH", "FAILED"].includes(row.status) && (
                      <InlineActionButton
                        disabled={busy}
                        onClick={() =>
                          act(() =>
                            runScheduledAction(
                              retryScheduledEmailAction,
                              row.id,
                            ),
                          )
                        }
                      >
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
      return "Delivery uncertain";
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
