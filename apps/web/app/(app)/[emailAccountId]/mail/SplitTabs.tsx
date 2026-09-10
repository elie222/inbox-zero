"use client";

import { ManageSplitsDialog } from "@/app/(app)/[emailAccountId]/mail/ManageSplitsDialog";
import { useEffect, useRef } from "react";
import {
  type NewSplitDraft,
  type NewSplitOption,
  NewSplitDialog,
  type NewSplitSuggestion,
} from "@/app/(app)/[emailAccountId]/mail/NewSplitDialog";
import { cn } from "@/utils";

export type MailSplitTab = {
  id: string;
  name: string;
};

type SplitTabsProps = {
  splits: MailSplitTab[];
  activeSplitId: string | null;
  onSelect: (splitId: string) => void;
  onDelete: (splitId: string) => Promise<void>;
  onReorder: (ids: string[]) => Promise<void>;
  newSplitOptions: NewSplitOption[];
  onCreateSplit: (draft: NewSplitDraft) => Promise<boolean>;
  onSuggestSplit: (prompt: string) => Promise<NewSplitSuggestion | null>;
  canAddDefaultSplits: boolean;
  canRemoveDefaultSplits: boolean;
  onSetDefaultSplits: (enabled: boolean) => Promise<boolean>;
  className?: string;
};

export function SplitTabs({
  splits,
  activeSplitId,
  onSelect,
  onDelete,
  onReorder,
  newSplitOptions,
  onCreateSplit,
  onSuggestSplit,
  canAddDefaultSplits,
  canRemoveDefaultSplits,
  onSetDefaultSplits,
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
          </div>
        );
      })}

      <ManageSplitsDialog
        splits={splits}
        onDelete={onDelete}
        onReorder={onReorder}
      />
      <NewSplitDialog
        options={newSplitOptions}
        onCreate={onCreateSplit}
        onSuggest={onSuggestSplit}
        canAddDefaultSplits={canAddDefaultSplits}
        canRemoveDefaultSplits={canRemoveDefaultSplits}
        onSetDefaultSplits={onSetDefaultSplits}
      />
    </div>
  );
}
