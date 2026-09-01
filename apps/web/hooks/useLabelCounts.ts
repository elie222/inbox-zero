import { useCallback, useEffect, useMemo, useRef } from "react";
import useSWR from "swr";
import type { LabelCountsResponse } from "@/app/api/labels/counts/route";
import { subscribeToMailboxStore } from "@/utils/email-cache/mailbox";
import { GmailLabel } from "@/utils/gmail/label";

/**
 * Unread/total counts per label, Gmail category, or Outlook folder.
 * Deliberately not blocking: the sidebar renders without counts and fills in.
 */
export function useLabelCounts({ emailAccountId }: { emailAccountId: string }) {
  const { data, error, isLoading, mutate } = useSWR<LabelCountsResponse>(
    "/api/labels/counts",
    { shouldRetryOnError: false },
  );
  const dataRef = useRef(data);
  const pendingInboxUnreadDelta = useRef(0);
  dataRef.current = data;

  useEffect(
    () =>
      subscribeToMailboxStore((changedAccountId) => {
        if (changedAccountId === emailAccountId) mutate();
      }),
    [emailAccountId, mutate],
  );

  const applyPendingInboxUnreadDelta = useCallback(() => {
    mutate(
      (current) => {
        if (
          !pendingInboxUnreadDelta.current ||
          !current?.counts.some((count) => count.id === GmailLabel.INBOX)
        ) {
          return current;
        }
        const delta = pendingInboxUnreadDelta.current;
        pendingInboxUnreadDelta.current = 0;
        return applyInboxUnreadDelta(current, delta);
      },
      { revalidate: false },
    );
  }, [mutate]);

  useEffect(() => {
    if (!data || !pendingInboxUnreadDelta.current) return;
    applyPendingInboxUnreadDelta();
  }, [applyPendingInboxUnreadDelta, data]);

  const adjustInboxUnread = useCallback(
    (delta: number) => {
      if (!delta) return;
      pendingInboxUnreadDelta.current += delta;
      if (!dataRef.current) {
        return;
      }
      applyPendingInboxUnreadDelta();
    },
    [applyPendingInboxUnreadDelta],
  );

  const countsById = useMemo(
    () => new Map((data?.counts ?? []).map((count) => [count.id, count])),
    [data?.counts],
  );

  return {
    countsById,
    isPartial: data?.partial ?? true,
    isLoading,
    error,
    mutate,
    adjustInboxUnread,
  };
}

function applyInboxUnreadDelta(
  current: LabelCountsResponse | undefined,
  delta: number,
) {
  if (!current) return current;
  return {
    ...current,
    counts: current.counts.map((count) =>
      count.id === GmailLabel.INBOX
        ? { ...count, unread: Math.max(0, count.unread + delta) }
        : count,
    ),
  };
}
