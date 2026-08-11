"use client";

import { XIcon } from "lucide-react";
import { Kbd } from "@/components/Kbd";
import { getShortcutHint, type ShortcutId } from "@/lib/shortcuts/registry";
import { cn } from "@/utils";

// The shortcuts worth advertising. Everything else lives behind `?`.
const HINTS: { id: ShortcutId; label: string }[] = [
  { id: "next", label: "move" },
  { id: "select", label: "select" },
  { id: "archive", label: "archive" },
  { id: "reply", label: "reply" },
  { id: "toggleLayout", label: "view" },
  { id: "help", label: "shortcuts" },
];

export type HintBarProps = {
  status?: string;
  onDismiss: () => void;
  className?: string;
};

/**
 * A keyboard-first screen is invisible without this: it's the only thing that
 * tells someone the shortcuts exist. Dismissible, because it stops earning its
 * space once you know them.
 */
export function HintBar({ status, onDismiss, className }: HintBarProps) {
  return (
    <footer
      className={cn(
        "flex h-9 shrink-0 items-center gap-4 overflow-x-auto border-t border-border bg-sidebar px-4 text-xs text-muted-foreground",
        className,
      )}
    >
      {HINTS.map((hint) => (
        <span key={hint.id} className="flex shrink-0 items-center gap-1.5">
          <Kbd>{getShortcutHint(hint.id)}</Kbd>
          {hint.label}
        </span>
      ))}

      <div className="flex-1" />

      {status ? <span className="shrink-0">{status}</span> : null}

      <button
        type="button"
        onClick={onDismiss}
        aria-label="Hide keyboard shortcut hints"
        className="-mr-1 shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <XIcon className="size-3.5" />
      </button>
    </footer>
  );
}
