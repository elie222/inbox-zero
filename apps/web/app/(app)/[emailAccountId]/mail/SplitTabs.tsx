"use client";

import { XIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
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
  onRename: (splitId: string, name: string) => void;
  newSplitOptions: NewSplitOption[];
  onCreateSplit: (draft: NewSplitDraft) => void;
  onCreateSplitFromPrompt: (prompt: string) => Promise<boolean>;
  canAddDefaultSplits: boolean;
  canRemoveDefaultSplits: boolean;
  onSetDefaultSplits: (enabled: boolean) => Promise<boolean>;
  /** Split creation stays account-scoped, so it is hidden in All accounts. */
  canCreateSplits: boolean;
  className?: string;
};

export function SplitTabs({
  splits,
  activeSplitId,
  onSelect,
  onDelete,
  onRename,
  newSplitOptions,
  onCreateSplit,
  onCreateSplitFromPrompt,
  canAddDefaultSplits,
  canRemoveDefaultSplits,
  onSetDefaultSplits,
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
      {splits.map((split) => (
        <SplitTab
          key={split.id}
          split={split}
          active={split.id === activeSplitId}
          activeTabRef={activeTabRef}
          onSelect={onSelect}
          onDelete={onDelete}
          onRename={onRename}
        />
      ))}

      {canCreateSplits && (
        <NewSplitPopover
          options={newSplitOptions}
          onCreate={onCreateSplit}
          onCreateFromPrompt={onCreateSplitFromPrompt}
          canAddDefaultSplits={canAddDefaultSplits}
          canRemoveDefaultSplits={canRemoveDefaultSplits}
          onSetDefaultSplits={onSetDefaultSplits}
        />
      )}

      <div className="flex-1" />
      <Kbd title="Next split">{getShortcutHint("nextSplit")}</Kbd>
    </div>
  );
}

function SplitTab({
  split,
  active,
  activeTabRef,
  onSelect,
  onDelete,
  onRename,
}: {
  split: MailSplitTab;
  active: boolean;
  activeTabRef: React.RefObject<HTMLButtonElement | null>;
  onSelect: (splitId: string) => void;
  onDelete: (splitId: string) => void;
  onRename: (splitId: string, name: string) => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [draftName, setDraftName] = useState(split.name);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const wasEditingRef = useRef(false);

  const startRename = () => {
    if (!split.deletable) return;
    setDraftName(split.name);
    setIsEditing(true);
  };

  const stopEditing = () => {
    setIsEditing(false);
  };

  const commitRename = () => {
    const next = draftName.trim();
    stopEditing();
    if (!next || next === split.name) {
      setDraftName(split.name);
      return;
    }
    onRename(split.id, next.slice(0, 60));
  };

  // F2 rename unmounts the input; restore focus so keyboard users keep place.
  useEffect(() => {
    if (wasEditingRef.current && !isEditing) {
      buttonRef.current?.focus({ preventScroll: true });
    }
    wasEditingRef.current = isEditing;
  }, [isEditing]);

  const setTabButtonRef = (node: HTMLButtonElement | null) => {
    buttonRef.current = node;
    if (active) {
      (
        activeTabRef as React.MutableRefObject<HTMLButtonElement | null>
      ).current = node;
    }
  };

  return (
    <div
      className={cn(
        "flex items-center gap-1 rounded-full py-0.5 pr-1 pl-2.5 text-xs",
        active
          ? "bg-primary/10 font-medium text-primary"
          : "text-muted-foreground hover:bg-accent hover:text-foreground",
      )}
    >
      {isEditing ? (
        <input
          value={draftName}
          onChange={(event) => setDraftName(event.target.value)}
          onBlur={commitRename}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              commitRename();
            }
            if (event.key === "Escape") {
              event.preventDefault();
              setDraftName(split.name);
              stopEditing();
            }
          }}
          aria-label={`Rename the ${split.name} split`}
          maxLength={60}
          // biome-ignore lint/a11y/noAutofocus: renaming starts from an explicit double-click
          autoFocus
          className="w-24 bg-transparent py-0.5 pr-1.5 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      ) : (
        <button
          type="button"
          ref={setTabButtonRef}
          data-split-tab
          onClick={() => onSelect(split.id)}
          onDoubleClick={startRename}
          onKeyDown={(event) => {
            if (event.key === "F2") {
              event.preventDefault();
              startRename();
            }
          }}
          aria-current={active ? "true" : undefined}
          title={split.deletable ? "Double-click to rename" : undefined}
          className="py-0.5 pr-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {split.name}
        </button>
      )}
      {active && split.deletable && !isEditing && (
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
}
