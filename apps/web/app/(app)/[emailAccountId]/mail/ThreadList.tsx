"use client";

import { addDays } from "date-fns/addDays";
import { startOfDay } from "date-fns/startOfDay";
import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { MailboxThreadList } from "@inboxzero/mail-ui/MailboxSurface";
import { ThreadRow } from "@/app/(app)/[emailAccountId]/mail/ThreadRow";
import type {
  ListThread,
  MailLayoutMode,
} from "@/app/(app)/[emailAccountId]/mail/types";
import { getListThreadKey } from "@/app/(app)/[emailAccountId]/mail/types";
import { LoadingMiniSpinner } from "@/components/Loading";
import { Button } from "@/components/ui/button";
import type { EmailLabels } from "@/providers/email-label-types";
import { useIsMobile } from "@/hooks/use-mobile";
import { useSentMessageOpensForThreads } from "@/hooks/useSentMessageOpens";
import { cn } from "@/utils";
import { formatDateGroupLabel } from "@/utils/date";
import { getThreadTimestamp } from "@/utils/threads/sort";
import { GmailLabel } from "@/utils/gmail/label";

const NO_LABELS: EmailLabels = {};

export type ThreadListProps = {
  threads: ListThread[];
  emptyMessage?: string;
  layout: MailLayoutMode;
  expandedPreview: boolean;
  userEmail: string;
  userLabels: EmailLabels;
  labelsByAccount?: Record<string, EmailLabels>;
  selectionEnabled?: boolean;
  /** The row `J`/`K` sits on. */
  focusedIndex: number;
  isSelected: (threadId: string) => boolean;
  selectedCount: number;
  onOpenThread: (index: number) => void;
  onToggleSelect: (index: number) => void;
  onSelectRangeTo: (index: number) => void;
  showLoadMore: boolean;
  isLoadingMore: boolean;
  onLoadMore: () => void;
  /** Identity of the current view so prefetch state does not leak across splits. */
  listKey: string;
  showSentOpenStatus?: boolean;
};

export const ThreadList = memo(function ThreadList({
  threads,
  emptyMessage = "No emails in this view",
  layout,
  expandedPreview,
  userEmail,
  userLabels,
  labelsByAccount,
  selectionEnabled = true,
  focusedIndex,
  isSelected,
  selectedCount,
  onOpenThread,
  onToggleSelect,
  onSelectRangeTo,
  showLoadMore,
  isLoadingMore,
  onLoadMore,
  listKey,
  showSentOpenStatus = false,
}: ThreadListProps) {
  const isMobile = useIsMobile();
  const dayStart = useDayStart();
  const sentThreadIds = useMemo(
    () =>
      showSentOpenStatus
        ? threads
            .filter((thread) =>
              thread.messages.at(-1)?.labelIds?.includes(GmailLabel.SENT),
            )
            .map((thread) => thread.id)
        : [],
    [showSentOpenStatus, threads],
  );
  const { data: sentMessageOpens } =
    useSentMessageOpensForThreads(sentThreadIds);
  const groupHeaderClassName = cn(
    "pt-4 pr-5 pb-1.5 font-normal text-muted-foreground text-sm",
    selectionEnabled ? "pl-[3.25rem]" : "pl-8",
  );
  const getGroupLabel = useCallback(
    (thread: ListThread) => {
      const timestamp = getThreadTimestamp(thread);
      return timestamp
        ? formatDateGroupLabel(new Date(timestamp), new Date(dayStart))
        : null;
    },
    [dayStart],
  );

  return (
    <MailboxThreadList
      emptyMessage={emptyMessage}
      focusedIndex={focusedIndex}
      getGroupLabel={getGroupLabel}
      getKey={getListThreadKey}
      groupHeaderClassName={groupHeaderClassName}
      isLoadingMore={isLoadingMore}
      isSelected={isSelected}
      items={threads}
      listKey={listKey}
      loadMoreButton={
        <Button onClick={onLoadMore} size="sm" variant="outline">
          Load more
        </Button>
      }
      loadingMoreIndicator={
        <div className="flex items-center gap-2 text-muted-foreground text-xs">
          <LoadingMiniSpinner />
          Loading more
        </div>
      }
      onLoadMore={onLoadMore}
      onOpen={onOpenThread}
      onSelectRangeTo={onSelectRangeTo}
      onToggleSelect={onToggleSelect}
      renderItem={(row) => (
        <ThreadRow
          compact={isMobile}
          expandedPreview={expandedPreview}
          hasAnySelection={row.hasAnySelection}
          index={row.index}
          isFocused={row.isFocused}
          isSelected={row.isSelected}
          key={row.rowKey}
          layout={layout}
          onOpen={row.onOpen}
          onSelectRangeTo={row.onSelectRangeTo}
          onToggleSelect={row.onToggleSelect}
          rowRef={row.rowRef}
          selectionEnabled={row.selectionEnabled}
          sentMessageOpen={
            showSentOpenStatus
              ? sentMessageOpens?.opens[row.item.messages.at(-1)?.id ?? ""]
              : undefined
          }
          thread={row.item}
          userEmail={userEmail}
          userLabels={
            "account" in row.item
              ? (labelsByAccount?.[row.item.account.id] ?? NO_LABELS)
              : userLabels
          }
        />
      )}
      selectedCount={selectedCount}
      selectionEnabled={selectionEnabled}
      showLoadMore={showLoadMore}
    />
  );
});

/** Refreshes idle lists at midnight and when a suspended tab becomes active. */
function useDayStart() {
  const [, setDayStart] = useState(() => startOfDay(new Date()).getTime());
  // Read the clock on every render, even if a background timer has not fired yet.
  const dayStart = startOfDay(new Date()).getTime();

  useEffect(() => {
    const refresh = () => setDayStart(startOfDay(new Date()).getTime());
    const timeout = setTimeout(
      refresh,
      Math.max(0, addDays(new Date(dayStart), 1).getTime() - Date.now()),
    );
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      clearTimeout(timeout);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [dayStart]);

  return dayStart;
}
