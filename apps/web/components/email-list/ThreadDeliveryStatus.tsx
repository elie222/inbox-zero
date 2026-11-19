"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { I18n } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import {
  AlertCircleIcon,
  BellIcon,
  CheckIcon,
  ClockIcon,
  LoaderCircleIcon,
  WifiOffIcon,
} from "lucide-react";
import useSWR, { useSWRConfig } from "swr";
import { useOptionalMailClient } from "@inboxzero/mail-react/MailEngineProvider";
import type { ReplyDraftMode } from "@/utils/mail-engine/reply-drafts";
import { useIsOnline } from "@/hooks/useIsOnline";
import { InlineActionButton } from "@/components/InlineActionButton";
import type { ScheduledEmailsResponse } from "@/app/api/user/scheduled-emails/route";
import { useScheduledEmailActions } from "@/hooks/useScheduledEmailActions";
import { getLatestScheduledSendId } from "@/components/email-list/latest-scheduled-send";
import {
  canEditEngineSend,
  engineDeliveryLabel,
  engineSendCommandsForThread,
  engineSendReplyMessageId,
  shouldShowEngineDeliveryStatus,
} from "@/utils/mail-engine/engine-delivery";
import { restoreUnsentReplyDraft } from "@/utils/mail-engine/reply-drafts";
import { upcomingScheduledEmailsKey } from "@/hooks/useHiddenDraftMessageIds";

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
  const { t, i18n } = useLingui();
  const client = useOptionalMailClient();
  const { mutate: mutateCache } = useSWRConfig();
  const { cancelSend, retrySend, cancelReminder } =
    useScheduledEmailActions(emailAccountId);
  const online = useIsOnline();
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
    threadScheduledEmailsKey(emailAccountId, threadId),
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
      // Which drafts are hidden follows whether their sends are still pending.
      await mutateCache(upcomingScheduledEmailsKey(emailAccountId)).catch(
        () => {},
      );
    } catch (failure) {
      setActionError(
        failure instanceof Error
          ? failure.message
          : t`Could not update delivery.`,
      );
    } finally {
      setBusy(false);
    }
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
    <section className="space-y-1" aria-label={t`Reply delivery status`}>
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
              {engineDeliveryLabel(row.status, online, i18n)}
            </p>
            {(row.status === "uncertain" || row.status === "failed") && (
              <a
                className="underline underline-offset-4"
                href={`/${emailAccountId}/mail?type=sent`}
              >
                <Trans>Check Sent</Trans>
              </a>
            )}
            {row.status === "failed" && (
              <InlineActionButton
                aria-label={t`Dismiss failed reply`}
                disabled={busy}
                onClick={() =>
                  setDismissedSendIds((current) => [
                    ...current,
                    row.operationId,
                  ])
                }
              >
                <Trans>Dismiss</Trans>
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
                    const failed =
                      row.status === "failed" ||
                      row.status === "needs_attention";
                    if (row.status === "queued" || row.status === "preparing") {
                      const result = await client?.cancelOperation({
                        accountId: emailAccountId,
                        operationId: row.operationId,
                      });
                      if (result && result.status !== "cancelled") {
                        throw new Error(
                          t`This reply's status changed. Refresh the thread and try again.`,
                        );
                      }
                    }
                    if (
                      failed ||
                      row.status === "queued" ||
                      row.status === "preparing"
                    ) {
                      await restoreUnsentReplyDraft({
                        client,
                        emailAccountId,
                        threadId,
                        messageId: parentMessageId,
                        operationId: row.operationId,
                      });
                    }
                    if (failed) {
                      setDismissedSendIds((current) => [
                        ...current,
                        row.operationId,
                      ]);
                    }
                    onEditReply(parentMessageId, "reply");
                  })
                }
              >
                <Trans>Edit reply</Trans>
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
              {scheduledDeliveryLabel(row, i18n)}
            </p>
            {["PENDING", "BLOCKED_AUTH", "FAILED"].includes(row.status) &&
              !isUnconfirmedScheduledEmail(row) && (
                <InlineActionButton
                  aria-label={t`Cancel send`}
                  disabled={!online}
                  onClick={() => cancelSend(row.id)}
                >
                  <Trans>Cancel</Trans>
                </InlineActionButton>
              )}
            {["BLOCKED_AUTH", "FAILED"].includes(row.status) && (
              <InlineActionButton
                aria-label={t`Retry send`}
                disabled={!online}
                onClick={() => retrySend(row.id)}
              >
                <Trans>Retry</Trans>
              </InlineActionButton>
            )}
            {row.status === "UNCERTAIN" && (
              <a
                className="underline underline-offset-4"
                href={`/${emailAccountId}/mail?type=sent`}
              >
                <Trans>Check Sent</Trans>
              </a>
            )}
          </div>
          {row.error && <p className="pl-5 text-destructive">{row.error}</p>}
          {row.remindAt &&
            ["PENDING", "PROCESSING"].includes(row.reminderStatus) && (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <p className="flex items-center gap-2">
                  <BellIcon aria-hidden className="size-3.5 shrink-0" />
                  <Trans>
                    Reminder if no reply by{" "}
                    {formatTime(row.remindAt, i18n.locale)}
                  </Trans>
                </p>
                {row.reminderStatus === "PENDING" &&
                  !isUnconfirmedScheduledEmail(row) && (
                    <InlineActionButton
                      aria-label={t`Cancel reminder`}
                      disabled={!online}
                      onClick={() => cancelReminder(row.id)}
                    >
                      <Trans>Cancel</Trans>
                    </InlineActionButton>
                  )}
              </div>
            )}
        </div>
      ))}
      {!online && scheduledRows.length > 0 && (
        <p role="status" className="text-muted-foreground text-xs">
          <Trans>Offline. Showing the last known status.</Trans>
        </p>
      )}
      {online && error && scheduledRows.length > 0 && (
        <div className="flex items-center gap-2 text-muted-foreground text-xs">
          <p role="status">
            <Trans>Could not refresh. Showing the last known status.</Trans>
          </p>
          <InlineActionButton
            disabled={isValidating}
            onClick={() => mutate().catch(() => undefined)}
          >
            <Trans>Retry</Trans>
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

/**
 * A scheduled email shown before the server confirmed it. It has no server
 * row yet, so it offers no actions until the confirmed row replaces it.
 */
export const UNCONFIRMED_SCHEDULED_EMAIL_PREFIX = "unconfirmed:";

function isUnconfirmedScheduledEmail(row: { id: string }) {
  return row.id.startsWith(UNCONFIRMED_SCHEDULED_EMAIL_PREFIX);
}

export function threadScheduledEmailsKey(
  emailAccountId: string,
  threadId: string,
) {
  return [
    `/api/user/scheduled-emails?threadId=${encodeURIComponent(threadId)}`,
    emailAccountId,
  ];
}

function formatTime(value: string | Date, locale: string) {
  return new Date(value).toLocaleString(locale, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function scheduledDeliveryLabel(
  row: ScheduledEmailsResponse["scheduledEmails"][number],
  i18n: I18n,
) {
  switch (row.status) {
    case "PENDING": {
      const sendAt = formatTime(row.sendAt, i18n.locale);
      return isUnconfirmedScheduledEmail(row)
        ? i18n._(msg`Scheduling for ${sendAt}…`)
        : i18n._(msg`Scheduled for ${sendAt}`);
    }
    case "PROCESSING":
      return i18n._(msg`Sending…`);
    case "SENT":
      return i18n._(msg`Reply sent`);
    case "UNCERTAIN":
      return i18n._(msg`Couldn't confirm delivery`);
    default:
      return i18n._(msg`Reply could not be sent`);
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
