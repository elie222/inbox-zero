"use client";

import { getShortcutHint } from "@/lib/shortcuts/registry";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/Kbd";

export type SelectionBarProps = {
  selectedCount: number;
  onArchive: () => void;
  onDelete: () => void;
  onClear: () => void;
};

/** The band above the list. Rendered only while the selection is non-empty. */
export function SelectionBar({
  selectedCount,
  onArchive,
  onDelete,
  onClear,
}: SelectionBarProps) {
  if (selectedCount === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2 border-primary/20 border-b bg-primary/5 px-3.5 py-2">
      <span
        aria-live="polite"
        className="font-medium text-primary text-xs"
      >{`${selectedCount} selected`}</span>

      <div className="flex-1" />

      <Button onClick={onArchive} size="xs-2" variant="outline">
        Archive
        <Kbd className="ml-1.5">{getShortcutHint("archive")}</Kbd>
      </Button>
      <Button
        className="hover:border-destructive/30 hover:bg-destructive/5 hover:text-destructive"
        onClick={onDelete}
        size="xs-2"
        variant="outline"
      >
        Delete
        <Kbd className="ml-1.5">{getShortcutHint("delete")}</Kbd>
      </Button>
      <Button onClick={onClear} size="xs-2" variant="ghost">
        Clear
      </Button>
    </div>
  );
}
