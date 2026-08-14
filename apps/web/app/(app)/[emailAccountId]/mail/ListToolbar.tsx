"use client";

import { ColumnsIcon, RowsIcon, SearchIcon, SparklesIcon } from "lucide-react";
import { Kbd } from "@/components/Kbd";
import { Tooltip } from "@/components/Tooltip";
import type { MailLayoutMode } from "@/app/(app)/[emailAccountId]/mail/types";
import { getShortcutHint } from "@/lib/shortcuts/registry";
import { cn } from "@/utils";

export type ListToolbarProps = {
  layout: MailLayoutMode;
  showLayoutToggle?: boolean;
  onOpenSearch: () => void;
  onToggleLayout: () => void;
  onToggleAssistant: () => void;
};

export function ListToolbar({
  layout,
  showLayoutToggle = true,
  onOpenSearch,
  onToggleLayout,
  onToggleAssistant,
}: ListToolbarProps) {
  const LayoutIcon = layout === "split" ? ColumnsIcon : RowsIcon;

  return (
    <div className="flex shrink-0 items-center gap-2 px-3 pt-3 pb-3">
      {/* Opens the command palette rather than searching mail — it navigates
          and runs actions, and promising search we don't have would mislead. */}
      <button
        type="button"
        onClick={onOpenSearch}
        className="flex h-8 min-w-0 flex-1 items-center gap-2 rounded-lg border border-border bg-sidebar px-2.5 text-muted-foreground text-sm transition-colors hover:border-[hsl(var(--border-strong))] hover:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <SearchIcon className="size-3.5 shrink-0" />
        <span className="min-w-0 flex-1 truncate text-left">
          Search or jump to…
        </span>
        <Kbd>{getShortcutHint("commandPalette")}</Kbd>
      </button>

      {showLayoutToggle ? (
        <Tooltip content="Switch list / split view">
          <button
            type="button"
            onClick={onToggleLayout}
            aria-label="Switch list or split view"
            className={toolbarButton}
          >
            <LayoutIcon className="size-3.5" />
            <Kbd>{getShortcutHint("toggleLayout")}</Kbd>
          </button>
        </Tooltip>
      ) : null}

      <Tooltip content="Assistant">
        <button
          type="button"
          onClick={onToggleAssistant}
          aria-label="Toggle the assistant"
          className={cn(toolbarButton, "px-0 w-8 justify-center")}
        >
          <SparklesIcon className="size-3.5" />
        </button>
      </Tooltip>
    </div>
  );
}

const toolbarButton =
  "flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-border bg-background px-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
