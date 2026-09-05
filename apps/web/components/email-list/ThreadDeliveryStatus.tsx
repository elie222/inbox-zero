"use client";

import { useEffect, useRef, useState } from "react";
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
  const latestScheduledSendId =
    data?.scheduledEmails.find((row) => row.status === "SENT")?.id ?? "";
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
    <section className="space-y-2" aria-label="Reply delivery status">
      {visible.map((row) => (
        <div
          key={row.id}
          className="rounded-lg border border-border bg-muted/30 px-4 py-3 text-sm"
        >
          <p role="status" className="font-medium">
            {deliveryLabel(row)}
          </p>
          {row.status !== "succeeded" && (
            <p className="mt-1 text-muted-foreground text-xs">
              {row.lastError ||
                "Your reply is saved in the outbox on this device."}
            </p>
          )}
          {row.status === "uncertain" && (
            <a
              className="mt-2 inline-block underline"
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
            className="rounded-lg border border-border bg-muted/30 px-4 py-3 text-sm"
          >
            <p role="status" className="font-medium">
              {scheduledDeliveryLabel(row)}
            </p>
            {row.error && (
              <p className="mt-1 text-destructive text-xs">{row.error}</p>
            )}
            {row.remindAt &&
              ["PENDING", "PROCESSING"].includes(row.reminderStatus) && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Remind me {formatTime(row.remindAt)} if no reply.
                </p>
              )}
            <div className="mt-1 flex flex-wrap gap-1">
              {["PENDING", "BLOCKED_AUTH", "FAILED"].includes(row.status) && (
                <Button
                  disabled={busy}
                  size="sm"
                  variant="ghost"
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
                  className="p-2 underline"
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

function deliveryLabel(row: StoredMailMutation) {
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
      return "Reply queued";
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
