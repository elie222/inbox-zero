"use client";

import { CheckIcon, XIcon } from "lucide-react";
import { cn } from "@/utils";

interface YesNoIndicatorProps {
  value: boolean | null | undefined;
  onClick?: (value: boolean) => void;
  size?: "sm" | "md";
}

export function YesNoIndicator({
  value,
  onClick,
  size = "md",
}: YesNoIndicatorProps) {
  const iconSize = size === "sm" ? "size-3.5" : "size-4";
  const isInteractive = !!onClick;

  if (value === true) {
    return (
      <button
        type="button"
        onClick={isInteractive ? () => onClick(true) : undefined}
        disabled={!isInteractive}
        className={cn(
          "rounded-full p-1.5 transition-colors",
          isInteractive
            ? "bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400 hover:opacity-80"
            : "bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400",
          !isInteractive && "cursor-default",
        )}
        aria-label="Correct"
      >
        <CheckIcon className={iconSize} />
      </button>
    );
  }

  if (value === false) {
    return (
      <button
        type="button"
        onClick={isInteractive ? () => onClick(false) : undefined}
        disabled={!isInteractive}
        className={cn(
          "rounded-full p-1.5 transition-colors",
          isInteractive
            ? "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400 hover:opacity-80"
            : "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400",
          !isInteractive && "cursor-default",
        )}
        aria-label="Wrong"
      >
        <XIcon className={iconSize} />
      </button>
    );
  }

  // value is null or undefined
  if (!isInteractive) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }

  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={() => onClick(true)}
        className="rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        aria-label="Correct"
      >
        <CheckIcon className={iconSize} />
      </button>
      <button
        type="button"
        onClick={() => onClick(false)}
        className="rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        aria-label="Wrong"
      >
        <XIcon className={iconSize} />
      </button>
    </div>
  );
}
