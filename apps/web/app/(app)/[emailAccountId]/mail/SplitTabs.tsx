"use client";

import { PlusIcon } from "lucide-react";
import { useEffect, useRef } from "react";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { Kbd } from "@/components/Kbd";
import { getShortcutHint } from "@/lib/shortcuts/registry";
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

        return (
          <div
            key={split.id}
            className={cn(
              "relative flex items-center gap-1 rounded-full py-0.5 pr-1 pl-2.5 text-xs",
              active
                ? "bg-primary/10 font-medium text-primary"
                : "text-muted-foreground hover:bg-accent hover:text-foreground",
            )}
          >
            <ContextMenu>
              <ContextMenuTrigger asChild disabled={!split.deletable}>
                <button
                  type="button"
                  ref={active ? activeTabRef : undefined}
                  data-split-tab
                  onClick={() => onSelect(split.id)}
                  aria-current={active ? "true" : undefined}
                  className="py-0.5 pr-1.5 after:pointer-events-none after:absolute after:inset-0 after:rounded-full focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-ring"
                >
                  {split.name}
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
          </div>
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

      <div className="flex-1" />
      <Kbd title="Next split">{getShortcutHint("nextSplit")}</Kbd>
    </div>
  );
}
