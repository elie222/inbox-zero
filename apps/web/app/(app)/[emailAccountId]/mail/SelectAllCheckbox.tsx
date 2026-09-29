"use client";

import { Tooltip } from "@/components/Tooltip";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/utils";

export function SelectAllCheckbox({
  threadCount,
  selectedCount,
  onSelectAll,
  onClearSelection,
}: {
  threadCount: number;
  selectedCount: number;
  onSelectAll: () => void;
  onClearSelection: () => void;
}) {
  const allSelected = threadCount > 0 && selectedCount === threadCount;
  let checked: boolean | "indeterminate" = false;
  if (allSelected) {
    checked = true;
  } else if (selectedCount > 0) {
    checked = "indeterminate";
  }

  return (
    <Tooltip
      content={allSelected ? "Deselect all conversations" : undefined}
      shortcuts={
        allSelected
          ? undefined
          : [{ id: "selectAll", label: "Select all conversations" }]
      }
    >
      <Checkbox
        aria-label="Select all conversations"
        checked={checked}
        className={cn(mailCheckboxClassName, "shrink-0")}
        disabled={threadCount === 0}
        onCheckedChange={(value) => {
          if (value === true) {
            onSelectAll();
          } else {
            onClearSelection();
          }
        }}
      />
    </Tooltip>
  );
}

/** Shared by the row checkboxes so select-all lines up with them and matches. */
export const mailCheckboxClassName =
  "size-3.5 rounded border-input data-[state=checked]:border-primary data-[state=indeterminate]:border-primary [&_svg]:size-2.5";
