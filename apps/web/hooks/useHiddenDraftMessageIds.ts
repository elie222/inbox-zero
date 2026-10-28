"use client";

import { useMemo, useSyncExternalStore } from "react";
import useSWR from "swr";
import type { UpcomingScheduledEmailsResponse } from "@/app/api/user/scheduled-emails/route";

type HiddenDrafts = { emailAccountId: string; messageIds: string[] };

const NO_HIDDEN_DRAFTS: HiddenDrafts[] = [];
let sendingDrafts = NO_HIDDEN_DRAFTS;
const listeners = new Set<() => void>();

export function upcomingScheduledEmailsKey(emailAccountId: string) {
  return ["/api/user/scheduled-emails", emailAccountId];
}

export function useUpcomingScheduledEmails(emailAccountId: string) {
  return useSWR<UpcomingScheduledEmailsResponse>(
    upcomingScheduledEmailsKey(emailAccountId),
    {
      refreshInterval: (current) => {
        const rows = current?.scheduledEmails ?? [];
        if (rows.some((row) => row.status === "PROCESSING")) return 5000;
        const dueTimes = rows
          .filter((row) => row.status === "PENDING")
          .map((row) => new Date(row.sendAt).getTime());
        return dueTimes.length
          ? Math.min(60_000, Math.max(5000, Math.min(...dueTimes) - Date.now()))
          : 0;
      },
    },
  );
}

/**
 * Mailbox drafts that a send still waiting to go out will deliver from. The
 * send stands in for them, so they're hidden until it goes out, and come back
 * if it's cancelled or fails.
 */
export function useHiddenDraftMessageIds(emailAccountId: string) {
  const { data } = useUpcomingScheduledEmails(emailAccountId);
  const sending = useSyncExternalStore(
    subscribe,
    () => sendingDrafts,
    () => NO_HIDDEN_DRAFTS,
  );
  return useMemo(
    () => [
      ...getScheduledDraftMessageIds(data?.scheduledEmails ?? []),
      ...sending
        .filter((entry) => entry.emailAccountId === emailAccountId)
        .flatMap((entry) => entry.messageIds),
    ],
    [data, sending, emailAccountId],
  );
}

/**
 * Hides a draft from this tab while its send is held for undo or queued on the
 * device, before the server knows about it. Returns a function that shows it
 * again.
 */
export function hideSendingDraftMessages(
  emailAccountId: string,
  messageIds: string[],
) {
  if (!messageIds.length) return () => {};
  const entry = { emailAccountId, messageIds };
  sendingDrafts = [...sendingDrafts, entry];
  notify();
  return () => {
    if (!sendingDrafts.includes(entry)) return;
    sendingDrafts = sendingDrafts.filter((item) => item !== entry);
    notify();
  };
}

export function getScheduledDraftMessageIds(
  rows: UpcomingScheduledEmailsResponse["scheduledEmails"],
) {
  return rows.flatMap((row) =>
    row.status === "PENDING" || row.status === "PROCESSING"
      ? row.draftMessageIds
      : [],
  );
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function notify() {
  for (const listener of listeners) listener();
}
