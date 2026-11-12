"use client";

import { useLingui } from "@lingui/react/macro";
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
  const { t } = useLingui();
  const allSelected = threadCount > 0 && selectedCount === threadCount;

  return (
    <Tooltip
      content={allSelected ? t`Deselect all conversations` : undefined}
      shortcuts={
        allSelected
          ? undefined
          : [{ id: "selectAll", label: t`Select all conversations` }]
      }
    >
      <Checkbox
        aria-label={t`Select all conversations`}
        checked={allSelected}
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

/**
 * Shared by the row checkboxes so select-all lines up with them and matches.
 * Keyed on `aria-checked` because a wrapping tooltip trigger overwrites
 * `data-state`. Checked is a blue tick on the plain box, not a fill, to stay light.
 */
export const mailCheckboxClassName =
  "size-3.5 rounded border-input aria-checked:bg-transparent aria-checked:text-primary data-[state=checked]:bg-transparent data-[state=checked]:text-primary [&_svg]:size-2.5";

/**
 * Row checkboxes are revealed on hover and get an invisible hit area that
 * reaches past the box, so a near miss selects instead of opening the thread.
 */
export function getMailRowCheckboxClassName(visible: boolean) {
  return cn(
    mailCheckboxClassName,
    "relative transition-opacity after:absolute after:-inset-3 after:content-['']",
    visible
      ? "opacity-100"
      : "opacity-0 group-focus-within:opacity-100 group-hover:opacity-100",
  );
}
