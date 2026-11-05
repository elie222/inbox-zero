"use client";

import { addDays } from "date-fns/addDays";
import { startOfDay } from "date-fns/startOfDay";
import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { MailboxThreadList } from "@inboxzero/mail-ui/MailboxSurface";
import { ThreadRow } from "@/app/(app)/[emailAccountId]/mail/ThreadRow";
import {
  InboxBundleHeader,
  InboxBundleRow,
} from "@/app/(app)/[emailAccountId]/mail/InboxBundleRow";
import type { InboxBundleRow as InboxBundleRowInfo } from "@/app/(app)/[emailAccountId]/mail/inbox-bundles";
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
const NO_BUNDLES = new Map<string, InboxBundleRowInfo>();

export type ThreadListProps = {
  threads: ListThread[];
  emptyMessage?: ReactNode;
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
  onHoverThread?: (thread: ListThread) => void;
  onToggleSelect: (index: number) => void;
  onSelectRangeTo: (index: number) => void;
  showLoadMore: boolean;
  isLoadingMore: boolean;
  onLoadMore: () => void;
  /** Identity of the current view so prefetch state does not leak across splits. */
  listKey: string;
  showSentOpenStatus?: boolean;
  onScrolledChange?: (scrolled: boolean) => void;
  /** Rows that stand for, or belong to, an inbox bundle, by thread key. */
  rowBundles?: Map<string, InboxBundleRowInfo>;
  onToggleBundle?: (bundleId: string) => void;
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
  onHoverThread,
  onToggleSelect,
  onSelectRangeTo,
  showLoadMore,
  isLoadingMore,
  onLoadMore,
  listKey,
  showSentOpenStatus = false,
  onScrolledChange,
  rowBundles = NO_BUNDLES,
  onToggleBundle,
}: ThreadListProps) {
  const isMobile = useIsMobile();
  // Collapsing removes the focused header, so a keyboard user's focus moves
  // to the collapsed row once it renders.
  const pendingFocusKeyRef = useRef<string | null>(null);
  useLayoutEffect(() => {
    const key = pendingFocusKeyRef.current;
    if (!key || rowBundles.get(key)?.kind !== "collapsed") return;
    pendingFocusKeyRef.current = null;
    document
      .querySelector<HTMLElement>(
        `[data-mail-thread-key="${CSS.escape(key)}"] [role="option"]`,
      )
      ?.focus();
  }, [rowBundles]);
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
      // An expanded bundle stays together under its newest thread's day.
      const bundleRow = rowBundles.get(getListThreadKey(thread));
      const timestamp = getThreadTimestamp(
        bundleRow?.bundle.threads[0] ?? thread,
      );
      return timestamp
        ? formatDateGroupLabel(new Date(timestamp), new Date(dayStart))
        : null;
    },
    [dayStart, rowBundles],
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
      onScrolledChange={onScrolledChange}
      onSelectRangeTo={onSelectRangeTo}
      onToggleSelect={onToggleSelect}
      renderItem={(row) => {
        const bundleRow = rowBundles.get(row.rowKey);
        if (bundleRow?.kind === "collapsed") {
          return (
            <div
              data-mail-thread-key={row.rowKey}
              key={row.rowKey}
              onPointerEnter={() => onHoverThread?.(row.item)}
            >
              <InboxBundleRow
                bundle={bundleRow.bundle}
                compact={isMobile}
                expandedPreview={expandedPreview}
                hasAnySelection={row.hasAnySelection}
                index={row.index}
                isFocused={row.isFocused}
                isSelected={row.isSelected}
                layout={layout}
                onOpen={row.onOpen}
                onSelectRangeTo={row.onSelectRangeTo}
                onToggleSelect={row.onToggleSelect}
                rowRef={row.rowRef}
                selectionEnabled={row.selectionEnabled}
                userEmail={userEmail}
              />
            </div>
          );
        }
        return (
          <div
            className={cn(
              bundleRow && "border-primary/40 border-l-2 bg-muted/20",
            )}
            data-mail-thread-key={row.rowKey}
            key={row.rowKey}
            onPointerEnter={() => onHoverThread?.(row.item)}
          >
            {bundleRow?.kind === "member" &&
            bundleRow.isFirst &&
            onToggleBundle ? (
              <InboxBundleHeader
                bundle={bundleRow.bundle}
                onCollapse={(fromKeyboard) => {
                  if (fromKeyboard) pendingFocusKeyRef.current = row.rowKey;
                  onToggleBundle(bundleRow.bundle.id);
                }}
              />
            ) : null}
            <ThreadRow
              compact={isMobile}
              expandedPreview={expandedPreview}
              hasAnySelection={row.hasAnySelection}
              index={row.index}
              isFocused={row.isFocused}
              isSelected={row.isSelected}
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
          </div>
        );
      }}
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
