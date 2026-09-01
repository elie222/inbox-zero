"use client";

import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { getShortcutHint } from "@/lib/shortcuts/registry";

export type SelectionBarProps = {
  selectedCount: number;
  onArchive: () => void;
  onMarkUnread: () => void;
  onDelete: () => void;
  onClear: () => void;
};

/** The band above the list. Rendered only while the selection is non-empty. */
export function SelectionBar({
  selectedCount,
  onArchive,
  onMarkUnread,
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

      <Tooltip>
        <TooltipTrigger asChild>
          <Button onClick={onArchive} size="xs-2" variant="outline">
            Archive
          </Button>
        </TooltipTrigger>
        <TooltipContent>Archive ({getShortcutHint("archive")})</TooltipContent>
      </Tooltip>
      <Button onClick={onMarkUnread} size="xs-2" variant="outline">
        Mark as unread
      </Button>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            className="hover:border-destructive/30 hover:bg-destructive/5 hover:text-destructive"
            onClick={onDelete}
            size="xs-2"
            variant="outline"
          >
            Delete
          </Button>
        </TooltipTrigger>
        <TooltipContent>Delete ({getShortcutHint("delete")})</TooltipContent>
      </Tooltip>
      <Button onClick={onClear} size="xs-2" variant="ghost">
        Clear
      </Button>
    </div>
  );
}
