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

  useEffect(() => {
    if (!data || !pendingInboxUnreadDelta.current) return;
    const delta = pendingInboxUnreadDelta.current;
    pendingInboxUnreadDelta.current = 0;
    mutate((current) => applyInboxUnreadDelta(current, delta), {
      revalidate: false,
    });
  }, [data, mutate]);

  const adjustInboxUnread = useCallback(
    (delta: number) => {
      if (!delta) return;
      if (!dataRef.current) {
        pendingInboxUnreadDelta.current += delta;
        return;
      }
      const totalDelta = pendingInboxUnreadDelta.current + delta;
      pendingInboxUnreadDelta.current = 0;
      mutate((current) => applyInboxUnreadDelta(current, totalDelta), {
        revalidate: false,
      });
    },
    [mutate],
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
