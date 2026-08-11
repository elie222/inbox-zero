"use client";

import type { ReactNode } from "react";
import { SelectionBar } from "@/app/(app)/[emailAccountId]/mail/SelectionBar";
import { ThreadRow } from "@/app/(app)/[emailAccountId]/mail/ThreadRow";
import type {
  ListThread,
  MailLayoutMode,
} from "@/app/(app)/[emailAccountId]/mail/types";
import { Button } from "@/components/ui/button";
import type { EmailLabels } from "@/providers/email-label-types";

export type ThreadListProps = {
  threads: ListThread[];
  layout: MailLayoutMode;
  userEmail: string;
  userLabels: EmailLabels;
  /** The row `J`/`K` sits on. `-1` when nothing is focused. */
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
  /** Rendered under the empty state, e.g. a "Back to Inbox" button. */
  emptyAction?: ReactNode;
  showLoadMore: boolean;
  isLoadingMore: boolean;
  onLoadMore: () => void;
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
  emptyAction,
  showLoadMore,
  isLoadingMore,
  onLoadMore,
}: ThreadListProps) {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <SelectionBar
        onArchive={onArchiveSelected}
        onClear={onClearSelection}
        onDelete={onDeleteSelected}
        selectedCount={selectedCount}
      />

      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
        {threads.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <div className="text-foreground text-sm">{emptyTitle}</div>
            <div className="mt-1.5 text-muted-foreground text-xs">
              Nothing here right now.
            </div>
            {emptyAction ? <div className="mt-3.5">{emptyAction}</div> : null}
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
                  thread={thread}
                  userEmail={userEmail}
                  userLabels={userLabels}
                />
              ))}
            </div>

            {showLoadMore ? (
              <div className="flex justify-center px-4 py-5">
                <Button
                  loading={isLoadingMore}
                  onClick={onLoadMore}
                  size="sm"
                  variant="outline"
                >
                  Load more
                </Button>
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
