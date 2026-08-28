"use client";

import { XIcon } from "lucide-react";
import {
  type NewSplitDraft,
  type NewSplitOption,
  NewSplitPopover,
} from "@/app/(app)/[emailAccountId]/mail/NewSplitPopover";
import { Kbd } from "@/components/Kbd";
import { getShortcutHint } from "@/lib/shortcuts/registry";
import { cn } from "@/utils";

export type MailSplitTab = {
  id: string;
  name: string;
  /** Built-in splits (e.g. All) can't be removed. */
  deletable: boolean;
};

export type SplitTabsProps = {
  splits: MailSplitTab[];
  activeSplitId: string | null;
  onSelect: (splitId: string) => void;
  onDelete: (splitId: string) => void;
  newSplitOptions: NewSplitOption[];
  onCreateSplit: (draft: NewSplitDraft) => void;
  onCreateSplitFromPrompt: (prompt: string) => Promise<boolean>;
  /** Split creation stays account-scoped, so it is hidden in All accounts. */
  canCreateSplits: boolean;
  className?: string;
};

export function SplitTabs({
  splits,
  activeSplitId,
  onSelect,
  onDelete,
  newSplitOptions,
  onCreateSplit,
  onCreateSplitFromPrompt,
  canCreateSplits,
  className,
}: SplitTabsProps) {
  return (
    <div
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
              "flex items-center gap-1 rounded-full py-0.5 pr-1 pl-2.5 text-xs",
              active
                ? "bg-primary/10 font-medium text-primary"
                : "text-muted-foreground hover:bg-accent hover:text-foreground",
            )}
          >
            <button
              type="button"
              onClick={() => onSelect(split.id)}
              aria-current={active ? "true" : undefined}
              className="py-0.5 pr-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {split.name}
            </button>
            {active && split.deletable && (
              <button
                type="button"
                onClick={() => onDelete(split.id)}
                aria-label={`Remove the ${split.name} split`}
                className="rounded-full p-0.5 text-primary/60 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <XIcon className="size-3" />
              </button>
            )}
          </div>
        );
      })}

      {canCreateSplits && (
        <NewSplitPopover
          options={newSplitOptions}
          onCreate={onCreateSplit}
          onCreateFromPrompt={onCreateSplitFromPrompt}
        />
      )}

      <div className="flex-1" />
      <Kbd title="Next split">{getShortcutHint("nextSplit")}</Kbd>
    </div>
  );
}
