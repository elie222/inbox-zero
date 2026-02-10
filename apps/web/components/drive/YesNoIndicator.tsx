"use client";

import type { MouseEvent } from "react";
import { CheckIcon, XIcon } from "lucide-react";
import { cn } from "@/utils";

interface YesNoIndicatorProps {
  value: boolean | null | undefined;
  onClick?: (value: boolean) => void;
  size?: "sm" | "md";
  /** When "wrong", the X button becomes a dropdown trigger (no onClick call, no stopPropagation) */
  dropdownTrigger?: "wrong";
  /** Force the X button to show as active (red) even when value !== false */
  wrongActive?: boolean;
}

export function YesNoIndicator({
  value,
  onClick,
  size = "md",
  dropdownTrigger,
  wrongActive,
}: YesNoIndicatorProps) {
  const iconSize = size === "sm" ? "size-3.5" : "size-4";
  const isInteractive = !!onClick || !!dropdownTrigger;

  if (!isInteractive) {
    if (value === true) {
      return (
        <span
          className="rounded-full p-1.5 bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400 inline-flex"
          role="status"
          aria-label="Correct"
        >
          <CheckIcon className={iconSize} />
        </span>
      );
    }
    if (value === false) {
      return (
        <span
          className="rounded-full p-1.5 bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400 inline-flex"
          role="status"
          aria-label="Wrong"
        >
          <XIcon className={iconSize} />
        </span>
      );
    }
    return <span className="text-xs text-muted-foreground">&mdash;</span>;
  }

  const handleCheckClick = (e: MouseEvent) => {
    if (dropdownTrigger) e.stopPropagation();
    if (value !== true) onClick?.(true);
  };

  const handleXClick = (_e: MouseEvent) => {
    if (dropdownTrigger === "wrong") {
      // Let the click propagate to the DropdownMenuTrigger parent
      return;
    }
    if (value !== false) onClick?.(false);
  };

  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={handleCheckClick}
        onPointerDown={dropdownTrigger ? (e) => e.stopPropagation() : undefined}
        className={cn(
          "rounded-full p-1.5 transition-colors",
          value === true && !wrongActive
            ? "bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400 hover:opacity-80"
            : "text-muted-foreground hover:bg-muted hover:text-foreground",
        )}
        aria-label="Correct"
      >
        <CheckIcon className={iconSize} />
      </button>
      <button
        type="button"
        onClick={handleXClick}
        className={cn(
          "rounded-full p-1.5 transition-colors",
          value === false || wrongActive
            ? "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400 hover:opacity-80"
            : "text-muted-foreground hover:bg-muted hover:text-foreground",
        )}
        aria-label="Wrong"
      >
        <XIcon className={iconSize} />
      </button>
    </div>
  );
}
