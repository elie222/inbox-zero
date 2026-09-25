"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  AlertCircleIcon,
  BellIcon,
  CheckIcon,
  ClockIcon,
  LoaderCircleIcon,
  WifiOffIcon,
} from "lucide-react";
import useSWR from "swr";
import { useOptionalMailClient } from "@inboxzero/mail-react/MailEngineProvider";
import type { ReplyDraftMode } from "@/utils/mail-engine/reply-drafts";
import { InlineActionButton } from "@/components/InlineActionButton";
import type { ScheduledEmailsResponse } from "@/app/api/user/scheduled-emails/route";
import {
  cancelScheduledEmailAction,
  cancelEmailReminderAction,
  retryScheduledEmailAction,
} from "@/utils/actions/scheduled-email";
import { getActionErrorMessage } from "@/utils/error";
import { getLatestScheduledSendId } from "@/components/email-list/latest-scheduled-send";
import {
  canEditEngineSend,
  engineDeliveryLabel,
  engineSendCommandsForThread,
  engineSendReplyMessageId,
  shouldShowEngineDeliveryStatus,
} from "@/utils/mail-engine/engine-delivery";
import { restoreCancelledSendDraft } from "@/utils/mail-engine/reply-drafts";

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
  onEditReply: (messageId: string, mode: ReplyDraftMode) => void;
  refetch: () => void;
  canEditReply: boolean;
}) {
  const client = useOptionalMailClient();
  const online = useSyncExternalStore(
    subscribeToConnectivity,
    () => navigator.onLine,
    () => true,
  );
  const [actionError, setActionError] = useState("");
  const [busy, setBusy] = useState(false);
  const [dismissedSendIds, setDismissedSendIds] = useState<string[]>([]);
  const { data: outbox = [], mutate: refreshOutbox } = useSWR(
    client ? ["thread-deliveries", emailAccountId, threadId] : null,
    async () => {
      if (!client) return [];
      const diagnostics = await client.getDiagnostics(emailAccountId);
      return engineSendCommandsForThread(diagnostics.commands, threadId);
    },
    {
      refreshInterval: (current) =>
        current?.some((row) =>
          [
            "queued",
            "preparing",
            "executing",
            "verifying",
            "retry_wait",
          ].includes(row.status),
        )
          ? 1000
          : 0,
    },
  );
  const { data, error, isValidating, mutate } = useSWR<ScheduledEmailsResponse>(
    [
      `/api/user/scheduled-emails?threadId=${encodeURIComponent(threadId)}`,
      emailAccountId,
    ],
    {
      isPaused: () => !navigator.onLine,
      refreshInterval: (current) => {
        if (!online) return 0;
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
    outbox.find((row) => row.status === "succeeded")?.operationId ?? "";
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
  const scheduledRows = (data?.scheduledEmails ?? []).filter(
    (row) =>
      row.status !== "SENT" ||
      row.id === latestScheduledSendId ||
      ["PENDING", "PROCESSING"].includes(row.reminderStatus),
  );
  const visible = useMemo(
    () =>
      outbox.filter(
        (row) =>
          !dismissedSendIds.includes(row.operationId) &&
          row.status !== "cancelled" &&
          row.status !== "superseded",
      ),
    [dismissedSendIds, outbox],
  );
  return (
    <section className="space-y-1" aria-label="Reply delivery status">
      {visible.map((row) => {
        const showStatus = shouldShowEngineDeliveryStatus({
          online,
          status: row.status,
        });
        if (!showStatus) return null;
        const iconStatus =
          online &&
          (row.status === "queued" ||
            row.status === "preparing" ||
            row.status === "retry_wait" ||
            row.status === "executing" ||
            row.status === "verifying")
            ? "processing"
            : row.status;
        return (
          <div
            key={row.operationId}
            className="flex flex-wrap items-center gap-x-3 gap-y-1 px-1 py-2 text-xs text-muted-foreground"
          >
            <p
              role="status"
              className="flex items-center gap-2 font-medium text-foreground"
            >
              <DeliveryIcon status={iconStatus} offline={!online} />
              {engineDeliveryLabel(row.status, online)}
            </p>
            {(row.status === "uncertain" || row.status === "failed") && (
              <a
                className="underline underline-offset-4"
                href={`/${emailAccountId}/mail?type=sent`}
              >
                Check Sent
              </a>
            )}
            {row.status === "failed" && (
              <InlineActionButton
                aria-label="Dismiss failed reply"
                disabled={busy}
                onClick={() =>
                  setDismissedSendIds((current) => [
                    ...current,
                    row.operationId,
                  ])
                }
              >
                Dismiss
              </InlineActionButton>
            )}
            {canEditReply && canEditEngineSend(row.status, online) && (
              <InlineActionButton
                disabled={busy}
                onClick={() =>
                  act(async () => {
                    const parentMessageId = engineSendReplyMessageId(
                      row,
                      messageIds,
                      threadId,
                    );
                    if (row.status === "queued" || row.status === "preparing") {
                      const result = await client?.cancelOperation({
                        accountId: emailAccountId,
                        operationId: row.operationId,
                      });
                      if (result && result.status !== "cancelled") {
                        throw new Error(
                          "This reply's status changed. Refresh the thread and try again.",
                        );
                      }
                      await restoreCancelledSendDraft({
                        client,
                        emailAccountId,
                        threadId,
                        messageId: parentMessageId,
                        operationId: row.operationId,
                      });
                    }
                    onEditReply(parentMessageId, "reply");
                  })
                }
              >
                Edit reply
              </InlineActionButton>
            )}
          </div>
        );
      })}
      {scheduledRows.map((row) => (
        <div
          key={row.id}
          className="space-y-1 px-1 py-2 text-xs text-muted-foreground"
        >
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <p
              role="status"
              className="flex items-center gap-2 font-medium text-foreground"
            >
              <DeliveryIcon status={row.status.toLowerCase()} />
              {scheduledDeliveryLabel(row)}
            </p>
            {["PENDING", "BLOCKED_AUTH", "FAILED"].includes(row.status) && (
              <InlineActionButton
                aria-label="Cancel send"
                disabled={busy || !online}
                onClick={() =>
                  act(() => scheduledAction(cancelScheduledEmailAction, row.id))
                }
              >
                Cancel
              </InlineActionButton>
            )}
            {["BLOCKED_AUTH", "FAILED"].includes(row.status) && (
              <InlineActionButton
                aria-label="Retry send"
                disabled={busy || !online}
                onClick={() =>
                  act(() => scheduledAction(retryScheduledEmailAction, row.id))
                }
              >
                Retry
              </InlineActionButton>
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
          {row.error && <p className="pl-5 text-destructive">{row.error}</p>}
          {row.remindAt &&
            ["PENDING", "PROCESSING"].includes(row.reminderStatus) && (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <p className="flex items-center gap-2">
                  <BellIcon aria-hidden className="size-3.5 shrink-0" />
                  Reminder if no reply by {formatTime(row.remindAt)}
                </p>
                {row.reminderStatus === "PENDING" && (
                  <InlineActionButton
                    aria-label="Cancel reminder"
                    disabled={busy || !online}
                    onClick={() =>
                      act(() =>
                        scheduledAction(cancelEmailReminderAction, row.id),
                      )
                    }
                  >
                    Cancel
                  </InlineActionButton>
                )}
              </div>
            )}
        </div>
      ))}
      {!online && scheduledRows.length > 0 && (
        <p role="status" className="text-muted-foreground text-xs">
          Offline. Showing the last known status.
        </p>
      )}
      {online && error && scheduledRows.length > 0 && (
        <div className="flex items-center gap-2 text-muted-foreground text-xs">
          <p role="status">Could not refresh. Showing the last known status.</p>
          <InlineActionButton
            disabled={isValidating}
            onClick={() => mutate().catch(() => undefined)}
          >
            Retry
          </InlineActionButton>
        </div>
      )}
      {actionError && (
        <p role="alert" className="text-destructive text-xs">
          {actionError}
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
      return "Couldn't confirm delivery";
    default:
      return "Reply could not be sent";
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
