"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { SelectionBar } from "@/app/(app)/[emailAccountId]/mail/SelectionBar";
import { ThreadRow } from "@/app/(app)/[emailAccountId]/mail/ThreadRow";
import type {
  ListThread,
  MailLayoutMode,
  MailListDensityMode,
} from "@/app/(app)/[emailAccountId]/mail/types";
import { getListThreadKey } from "@/app/(app)/[emailAccountId]/mail/types";
import {
  scrollElementIntoContainer,
  shouldPrefetchMoreThreads,
  THREAD_LOAD_MORE_ROOT_MARGIN,
} from "@/app/(app)/[emailAccountId]/mail/thread-list-behavior";
import { LoadingMiniSpinner } from "@/components/Loading";
import { Button } from "@/components/ui/button";
import type { EmailLabels } from "@/providers/email-label-types";
import { useIsMobile } from "@/hooks/use-mobile";

export type ThreadListProps = {
  threads: ListThread[];
  layout: MailLayoutMode;
  density: MailListDensityMode;
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
  onArchiveSelected: () => void;
  onDeleteSelected: () => void;
  onClearSelection: () => void;
  showLoadMore: boolean;
  isLoadingMore: boolean;
  onLoadMore: () => void;
  /** Identity of the current view so prefetch state does not leak across splits. */
  listKey: string;
};

export function ThreadList({
  threads,
  layout,
  density,
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
  onArchiveSelected,
  onDeleteSelected,
  onClearSelection,
  showLoadMore,
  isLoadingMore,
  onLoadMore,
  listKey,
}: ThreadListProps) {
  const isMobile = useIsMobile();
  const [scrollRoot, setScrollRoot] = useState<HTMLDivElement | null>(null);
  const focusedRowRef = useRef<HTMLDivElement | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const prefetchForCount = useRef<number | null>(null);
  const prefetchListKey = useRef(listKey);
  const onLoadMoreRef = useRef(onLoadMore);
  onLoadMoreRef.current = onLoadMore;
  const focusedThreadId = threads[focusedIndex]
    ? getListThreadKey(threads[focusedIndex])
    : undefined;

  // Keep the J/K cursor on screen without centering every row. Layout phase so
  // a held arrow key never paints a selected row that's already off-screen.
  // biome-ignore lint/correctness/useExhaustiveDependencies: density changes row height without changing focusedIndex
  useLayoutEffect(() => {
    if (!scrollRoot || focusedIndex < 0 || !focusedThreadId) return;
    const row = focusedRowRef.current;
    if (!row) return;
    scrollElementIntoContainer(scrollRoot, row);
  }, [density, focusedIndex, focusedThreadId, scrollRoot]);

  useEffect(() => {
    if (prefetchListKey.current !== listKey) {
      prefetchListKey.current = listKey;
      prefetchForCount.current = null;
    }
    if (
      !shouldPrefetchMoreThreads({
        hasMore: showLoadMore,
        isLoadingMore,
        focusedIndex,
        threadCount: threads.length,
      })
    ) {
      return;
    }
    // A failed page doesn't grow the list; don't retry it in a loop.
    if (prefetchForCount.current === threads.length) return;
    prefetchForCount.current = threads.length;
    onLoadMoreRef.current();
  }, [focusedIndex, isLoadingMore, listKey, showLoadMore, threads.length]);

  useEffect(() => {
    if (!showLoadMore || !scrollRoot || threads.length === 0) return;
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          onLoadMoreRef.current();
        }
      },
      { root: scrollRoot, rootMargin: THREAD_LOAD_MORE_ROOT_MARGIN },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [scrollRoot, showLoadMore, threads.length]);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      {selectionEnabled ? (
        <SelectionBar
          onArchive={onArchiveSelected}
          onClear={onClearSelection}
          onDelete={onDeleteSelected}
          selectedCount={selectedCount}
        />
      ) : null}

      <div
        className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden"
        ref={setScrollRoot}
      >
        {threads.length === 0 ? (
          <div className="px-6 py-12 text-center text-muted-foreground text-sm">
            No emails in this view
          </div>
        ) : (
          <>
            <div
              aria-label="Conversations"
              aria-multiselectable={selectionEnabled || undefined}
              role="listbox"
            >
              {threads.map((thread, index) => {
                const threadKey = getListThreadKey(thread);
                return (
                  <ThreadRow
                    hasAnySelection={selectionEnabled && selectedCount > 0}
                    compact={isMobile}
                    density={density}
                    index={index}
                    isFocused={index === focusedIndex}
                    isSelected={selectionEnabled && isSelected(threadKey)}
                    key={threadKey}
                    layout={layout}
                    onOpen={onOpenThread}
                    onSelectRangeTo={onSelectRangeTo}
                    onToggleSelect={onToggleSelect}
                    rowRef={index === focusedIndex ? focusedRowRef : undefined}
                    selectionEnabled={selectionEnabled}
                    thread={thread}
                    userEmail={userEmail}
                    userLabels={
                      "account" in thread
                        ? (labelsByAccount?.[thread.account.id] ?? {})
                        : userLabels
                    }
                  />
                );
              })}
            </div>

            {showLoadMore ? (
              <div className="flex justify-center px-4 py-5" ref={sentinelRef}>
                {isLoadingMore ? (
                  <div
                    aria-live="polite"
                    className="flex items-center gap-2 text-muted-foreground text-xs"
                  >
                    <LoadingMiniSpinner />
                    Loading more
                  </div>
                ) : (
                  <Button onClick={onLoadMore} size="sm" variant="outline">
                    Load more
                  </Button>
                )}
              </div>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
