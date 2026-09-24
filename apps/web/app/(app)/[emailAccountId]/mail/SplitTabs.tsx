"use client";

import { PlusIcon } from "lucide-react";
import { Fragment, useEffect, useRef } from "react";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { cn } from "@/utils";

export type MailSplitTab = {
  id: string;
  name: string;
  /** Built-in splits (e.g. All) can't be edited or removed. */
  deletable: boolean;
};

export type SplitTabsProps = {
  splits: MailSplitTab[];
  activeSplitId: string | null;
  /** Conversations currently in each split. Missing entries stay blank. */
  countsById?: ReadonlyMap<string, number>;
  onSelect: (splitId: string) => void;
  onDelete: (splitId: string) => void;
  onEdit?: (splitId: string) => void;
  onNewSplit: () => void;
  /** Split creation stays account-scoped, so it is hidden in All accounts. */
  canCreateSplits: boolean;
  className?: string;
};

export function SplitTabs({
  splits,
  activeSplitId,
  countsById,
  onSelect,
  onDelete,
  onEdit,
  onNewSplit,
  canCreateSplits,
  className,
}: SplitTabsProps) {
  const tabsRef = useRef<HTMLDivElement>(null);
  const activeTabRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const tabs = tabsRef.current;
    const focusedTab = document.activeElement;
    if (
      !activeSplitId ||
      !(focusedTab instanceof HTMLButtonElement) ||
      !tabs?.contains(focusedTab) ||
      !focusedTab.hasAttribute("data-split-tab")
    ) {
      return;
    }

    activeTabRef.current?.focus({ preventScroll: true });
  }, [activeSplitId]);

  return (
    <div
      ref={tabsRef}
      className={cn(
        // Padded to sit under the toolbar's search field rather than against
        // the column edge, and ruled off so the tabs read as a header for the
        // list instead of crowding the first row.
        "flex flex-wrap items-center gap-1 border-border border-b px-3 pb-2",
        className,
      )}
    >
      {splits.map((split) => {
        const active = split.id === activeSplitId;
        const countLabel = splitCountLabel(countsById?.get(split.id));

        return (
          <Fragment key={split.id}>
            <ContextMenu>
              <ContextMenuTrigger asChild disabled={!split.deletable}>
                <button
                  type="button"
                  ref={active ? activeTabRef : undefined}
                  data-split-tab
                  onClick={() => onSelect(split.id)}
                  aria-current={active ? "true" : undefined}
                  aria-describedby={
                    countLabel ? `split-count-${split.id}` : undefined
                  }
                  className={cn(
                    "flex items-center gap-1 rounded-full py-0.5 pr-2 pl-2.5 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    active
                      ? "bg-primary/10 font-medium text-primary"
                      : "text-muted-foreground hover:bg-accent hover:text-foreground",
                  )}
                >
                  <span data-split-name>{split.name}</span>
                  {countLabel ? (
                    <span aria-hidden="true" className="tabular-nums">
                      {countLabel}
                    </span>
                  ) : null}
                </button>
              </ContextMenuTrigger>
              <ContextMenuContent className="w-44">
                {onEdit && (
                  <ContextMenuItem onSelect={() => onEdit(split.id)}>
                    Edit filters and name
                  </ContextMenuItem>
                )}
                <ContextMenuItem
                  className="text-destructive focus:text-destructive"
                  onSelect={() => onDelete(split.id)}
                >
                  Turn off split
                </ContextMenuItem>
              </ContextMenuContent>
            </ContextMenu>
            {countLabel ? (
              <span id={`split-count-${split.id}`} className="sr-only">
                {countLabel} in this view
              </span>
            ) : null}
          </Fragment>
        );
      })}

      {canCreateSplits && (
        <button
          type="button"
          aria-label="New split"
          onClick={onNewSplit}
          className="flex size-6 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <PlusIcon className="size-3.5" />
        </button>
      )}
    </div>
  );
}

function splitCountLabel(count: number | undefined): string | null {
  if (count == null || !Number.isFinite(count) || count < 0) return null;
  return count.toLocaleString("en-US");
}
