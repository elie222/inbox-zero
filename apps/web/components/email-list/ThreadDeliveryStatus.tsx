"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  AlertCircleIcon,
  CheckIcon,
  ClockIcon,
  LoaderCircleIcon,
  WifiOffIcon,
} from "lucide-react";
import useSWR from "swr";
import { restoreReplyFromOutbox } from "@/utils/email-cache/reply-drafts";
import { Button } from "@/components/ui/button";
import {
  getEmailCacheDatabase,
  type StoredMailMutation,
} from "@/utils/email-cache/database";
import { subscribeToMailMutations } from "@/utils/email-cache/mail-mutations";
import type { ScheduledEmailsResponse } from "@/app/api/user/scheduled-emails/route";
import {
  cancelScheduledEmailAction,
  cancelEmailReminderAction,
  retryScheduledEmailAction,
} from "@/utils/actions/scheduled-email";
import { getActionErrorMessage } from "@/utils/error";
import { getLatestScheduledSendId } from "@/components/email-list/latest-scheduled-send";

export function ThreadDeliveryStatus({
  emailAccountId,
  threadId,
  messageIds,
  onEditReply,
  refetch,
  canEditReply,
}: {
  emailAccountId: string;
  threadId: string;
  messageIds: string[];
  onEditReply: (messageId: string) => void;
  refetch: () => void;
  canEditReply: boolean;
}) {
  const online = useSyncExternalStore(
    subscribeToConnectivity,
    () => navigator.onLine,
    () => true,
  );
  const [actionError, setActionError] = useState("");
  const [busy, setBusy] = useState(false);
  const { data: outbox = [], mutate: refreshOutbox } = useSWR(
    ["thread-deliveries", emailAccountId, threadId],
    async () => {
      const db = await getEmailCacheDatabase();
      const rows = await db?.getAllFromIndex(
        "mailMutations",
        "byAccountThread",
        [emailAccountId, threadId],
      );
      return (rows ?? [])
        .filter((row) => row.kind === "reply")
        .sort((a, b) => b.createdAt - a.createdAt);
    },
  );
  useEffect(
    () =>
      subscribeToMailMutations(() => {
        refreshOutbox();
      }),
    [refreshOutbox],
  );
  const { data, error, mutate } = useSWR<ScheduledEmailsResponse>(
    [
      `/api/user/scheduled-emails?threadId=${encodeURIComponent(threadId)}`,
      emailAccountId,
    ],
    {
      refreshInterval: (current) => {
        const rows = current?.scheduledEmails ?? [];
        if (
          rows.some(
            (row) =>
              row.status === "PROCESSING" ||
              row.reminderStatus === "PROCESSING",
          )
        )
          return 5000;
        const dueTimes = rows.flatMap((row) => [
          ...(row.status === "PENDING" ? [new Date(row.sendAt).getTime()] : []),
          ...(row.status === "SENT" &&
          row.reminderStatus === "PENDING" &&
          row.remindAt
            ? [new Date(row.remindAt).getTime()]
            : []),
        ]);
        return dueTimes.length
          ? Math.min(60_000, Math.max(5000, Math.min(...dueTimes) - Date.now()))
          : 0;
      },
    },
  );
  const latestScheduledSendId = getLatestScheduledSendId(
    data?.scheduledEmails ?? [],
  );
  const latestOutboxSendId =
    outbox.find((row) => row.status === "succeeded")?.id ?? "";
  const completedSendKey = `${latestScheduledSendId}:${latestOutboxSendId}`;
  const refreshedSendKey = useRef(":");
  useEffect(() => {
    if (
      completedSendKey === ":" ||
      completedSendKey === refreshedSendKey.current
    )
      return;
    refreshedSendKey.current = completedSendKey;
    refetch();
  }, [completedSendKey, refetch]);
  const act = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setActionError("");
    try {
      await action();
      await mutate();
      await refreshOutbox();
    } catch (failure) {
      setActionError(
        failure instanceof Error
          ? failure.message
          : "Could not update delivery.",
      );
    } finally {
      setBusy(false);
    }
  };
  const scheduledAction = async (
    action: typeof cancelScheduledEmailAction,
    id: string,
  ) => {
    const result = await action(emailAccountId, { id });
    if (result?.serverError || result?.validationErrors)
      throw new Error(getActionErrorMessage(result));
  };
  const visible = outbox.filter(
    (row, index) =>
      row.status !== "succeeded" ||
      (index === 0 &&
        !messageIds.includes(
          (row.result as { messageId?: string } | undefined)?.messageId ?? "",
        )),
  );
  return (
    <section className="space-y-1" aria-label="Reply delivery status">
      {visible.map((row) => (
        <div
          key={row.id}
          className="flex flex-wrap items-center gap-x-3 gap-y-1 px-1 py-2 text-xs text-muted-foreground"
        >
          <p
            role="status"
            className="flex items-center gap-2 font-medium text-foreground"
          >
            <DeliveryIcon status={row.status} offline={!online} />
            {deliveryLabel(row, online)}
          </p>
          {row.status !== "succeeded" && row.lastError && (
            <p className="order-last basis-full pl-5 text-muted-foreground">
              {row.lastError}
            </p>
          )}
          {row.status === "uncertain" && (
            <a
              className="underline underline-offset-4"
              href={`/${emailAccountId}/mail?type=sent`}
            >
              Check Sent
            </a>
          )}
          {canEditReply &&
            ["pending", "retry_wait", "blocked_auth", "failed"].includes(
              row.status,
            ) && (
              <Button
                disabled={busy}
                type="button"
                variant="ghost"
                className="h-auto px-1 py-1 text-xs text-muted-foreground hover:text-foreground"
                size="sm"
                onClick={() =>
                  act(async () => {
                    await restoreReplyFromOutbox(row.id, emailAccountId);
                    onEditReply(row.messageIds[0]);
                  })
                }
              >
                Edit reply
              </Button>
            )}
        </div>
      ))}
      {data?.scheduledEmails
        .filter(
          (row) =>
            row.status !== "SENT" ||
            row.id === latestScheduledSendId ||
            ["PENDING", "PROCESSING"].includes(row.reminderStatus),
        )
        .map((row) => (
          <div
            key={row.id}
            className="flex flex-wrap items-center gap-x-3 gap-y-1 px-1 py-2 text-xs text-muted-foreground"
          >
            <p
              role="status"
              className="flex items-center gap-2 font-medium text-foreground"
            >
              <DeliveryIcon status={row.status.toLowerCase()} />
              {scheduledDeliveryLabel(row)}
            </p>
            {row.error && (
              <p className="order-last basis-full pl-5 text-destructive">
                {row.error}
              </p>
            )}
            {row.remindAt &&
              ["PENDING", "PROCESSING"].includes(row.reminderStatus) && (
                <p className="order-last basis-full pl-5 text-muted-foreground">
                  Remind me {formatTime(row.remindAt)} if no reply.
                </p>
              )}
            <div className="contents">
              {["PENDING", "BLOCKED_AUTH", "FAILED"].includes(row.status) && (
                <Button
                  disabled={busy}
                  size="sm"
                  variant="ghost"
                  className="h-auto px-1 py-1 text-xs text-muted-foreground hover:text-foreground"
                  onClick={() =>
                    act(() =>
                      scheduledAction(cancelScheduledEmailAction, row.id),
                    )
                  }
                >
                  Cancel send
                </Button>
              )}
              {["BLOCKED_AUTH", "FAILED"].includes(row.status) && (
                <Button
                  disabled={busy}
                  size="sm"
                  variant="ghost"
                  className="h-auto px-1 py-1 text-xs text-muted-foreground hover:text-foreground"
                  onClick={() =>
                    act(() =>
                      scheduledAction(retryScheduledEmailAction, row.id),
                    )
                  }
                >
                  Retry send
                </Button>
              )}
              {row.reminderStatus === "PENDING" && (
                <Button
                  disabled={busy}
                  size="sm"
                  variant="ghost"
                  className="h-auto px-1 py-1 text-xs text-muted-foreground hover:text-foreground"
                  onClick={() =>
                    act(() =>
                      scheduledAction(cancelEmailReminderAction, row.id),
                    )
                  }
                >
                  Cancel reminder
                </Button>
              )}
              {row.status === "UNCERTAIN" && (
                <a
                  className="underline underline-offset-4"
                  href={`/${emailAccountId}/mail?type=sent`}
                >
                  Check Sent
                </a>
              )}
            </div>
          </div>
        ))}
      {(actionError || error) && (
        <p role="alert" className="text-destructive text-xs">
          {actionError || "Could not load scheduled replies."}
        </p>
      )}
    </section>
  );
}

function formatTime(value: string | Date) {
  return new Date(value).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function deliveryLabel(row: StoredMailMutation, online: boolean) {
  switch (row.status) {
    case "succeeded":
      return "Reply sent";
    case "processing":
      return "Sending…";
    case "uncertain":
      return "Delivery uncertain";
    case "failed":
      return "Reply could not be sent";
    case "blocked_auth":
      return "Reconnect your account to send this reply";
    default:
      return online ? "Waiting to send" : "Waiting for connection";
  }
}

function scheduledDeliveryLabel(
  row: ScheduledEmailsResponse["scheduledEmails"][number],
) {
  switch (row.status) {
    case "PENDING":
      return `Scheduled for ${formatTime(row.sendAt)}`;
    case "PROCESSING":
      return "Sending…";
    case "SENT":
      return "Reply sent";
    case "UNCERTAIN":
      return "Delivery uncertain";
    default:
      return "Reply needs attention";
  }
}

function DeliveryIcon({
  status,
  offline = false,
}: {
  status: string;
  offline?: boolean;
}) {
  if (status === "processing")
    return (
      <LoaderCircleIcon
        aria-hidden
        className="size-3.5 shrink-0 motion-safe:animate-spin text-muted-foreground"
      />
    );
  if (status === "succeeded" || status === "sent")
    return (
      <CheckIcon
        aria-hidden
        className="size-3.5 shrink-0 text-muted-foreground"
      />
    );
  if (["uncertain", "failed", "blocked_auth"].includes(status))
    return (
      <AlertCircleIcon
        aria-hidden
        className="size-3.5 shrink-0 text-destructive"
      />
    );
  if (offline)
    return (
      <WifiOffIcon
        aria-hidden
        className="size-3.5 shrink-0 text-muted-foreground"
      />
    );
  return (
    <ClockIcon
      aria-hidden
      className="size-3.5 shrink-0 text-muted-foreground"
    />
  );
}

function subscribeToConnectivity(onChange: () => void) {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
}
