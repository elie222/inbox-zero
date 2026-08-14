"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { SelectionBar } from "@/app/(app)/[emailAccountId]/mail/SelectionBar";
import { ThreadRow } from "@/app/(app)/[emailAccountId]/mail/ThreadRow";
import type {
  ListThread,
  MailLayoutMode,
} from "@/app/(app)/[emailAccountId]/mail/types";
import {
  scrollElementIntoContainer,
  shouldPrefetchMoreThreads,
  THREAD_LOAD_MORE_ROOT_MARGIN,
} from "@/app/(app)/[emailAccountId]/mail/thread-list-behavior";
import { LoadingMiniSpinner } from "@/components/Loading";
import { Button } from "@/components/ui/button";
import type { EmailLabels } from "@/providers/email-label-types";

export type ThreadListProps = {
  threads: ListThread[];
  layout: MailLayoutMode;
  userEmail: string;
  userLabels: EmailLabels;
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
  emptyTitle: string;
  showLoadMore: boolean;
  isLoadingMore: boolean;
  onLoadMore: () => void;
  /** Identity of the current view so prefetch state does not leak across splits. */
  listKey: string;
};

export function ThreadList({
  threads,
  layout,
  userEmail,
  userLabels,
  focusedIndex,
  isSelected,
  selectedCount,
  onOpenThread,
  onToggleSelect,
  onSelectRangeTo,
  onArchiveSelected,
  onDeleteSelected,
  onClearSelection,
  emptyTitle,
  showLoadMore,
  isLoadingMore,
  onLoadMore,
  listKey,
}: ThreadListProps) {
  const [scrollRoot, setScrollRoot] = useState<HTMLDivElement | null>(null);
  const focusedRowRef = useRef<HTMLDivElement | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const prefetchForCount = useRef<number | null>(null);
  const prefetchListKey = useRef(listKey);
  const onLoadMoreRef = useRef(onLoadMore);
  onLoadMoreRef.current = onLoadMore;
  const focusedThreadId = threads[focusedIndex]?.id;

  // Keep the J/K cursor on screen without centering every row. Layout phase so
  // a held arrow key never paints a selected row that's already off-screen.
  useLayoutEffect(() => {
    if (!scrollRoot || focusedIndex < 0 || !focusedThreadId) return;
    const row = focusedRowRef.current;
    if (!row) return;
    scrollElementIntoContainer(scrollRoot, row);
  }, [focusedIndex, focusedThreadId, scrollRoot]);

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
      <SelectionBar
        onArchive={onArchiveSelected}
        onClear={onClearSelection}
        onDelete={onDeleteSelected}
        selectedCount={selectedCount}
      />

      <div
        className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden"
        ref={setScrollRoot}
      >
        {threads.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <div className="text-foreground text-sm">{emptyTitle}</div>
            <div className="mt-1.5 text-muted-foreground text-xs">
              Nothing here right now.
            </div>
          </div>
        ) : (
          <>
            <div aria-label="Conversations" aria-multiselectable role="listbox">
              {threads.map((thread, index) => (
                <ThreadRow
                  hasAnySelection={selectedCount > 0}
                  index={index}
                  isFocused={index === focusedIndex}
                  isSelected={isSelected(thread.id)}
                  key={thread.id}
                  layout={layout}
                  onOpen={onOpenThread}
                  onSelectRangeTo={onSelectRangeTo}
                  onToggleSelect={onToggleSelect}
                  rowRef={index === focusedIndex ? focusedRowRef : undefined}
                  thread={thread}
                  userEmail={userEmail}
                  userLabels={userLabels}
                />
              ))}
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
            ) : (
              <div className="px-4 pt-5 pb-10 text-center text-muted-foreground text-xs">
                That's everything in this view
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
