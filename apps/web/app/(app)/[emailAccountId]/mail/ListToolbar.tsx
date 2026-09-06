"use client";

import { useRef } from "react";
import {
  ArchiveIcon,
  ColumnsIcon,
  RowsIcon,
  SearchIcon,
  SparklesIcon,
  TagIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react";
import { Kbd } from "@/components/Kbd";
import { Tooltip } from "@/components/Tooltip";
import { SidebarTrigger } from "@/components/ui/sidebar";
import type { MailLayoutMode } from "@/app/(app)/[emailAccountId]/mail/types";
import { getShortcutHint } from "@/lib/shortcuts/registry";
import { cn } from "@/utils";

export type ListToolbarProps = {
  layout: MailLayoutMode;
  showLayoutToggle?: boolean;
  /** Committed search query. Only meaningful when `onSearch` is provided. */
  searchQuery?: string;
  /** When provided, the toolbar shows a real mail search input. */
  onSearch?: (query: string) => void;
  onOpenSearch: () => void;
  onToggleLayout: () => void;
  onToggleAssistant: () => void;
  showSidebarToggle?: boolean;
  selectedCount: number;
  onArchiveSelected: () => void;
  onDeleteSelected: () => void;
  /** Omitted when the current view can't label (combined inboxes). */
  onLabelSelected?: () => void;
  onClearSelection: () => void;
};

export function ListToolbar({
  layout,
  showLayoutToggle = true,
  searchQuery = "",
  onSearch,
  onOpenSearch,
  onToggleLayout,
  onToggleAssistant,
  showSidebarToggle = false,
  selectedCount,
  onArchiveSelected,
  onDeleteSelected,
  onLabelSelected,
  onClearSelection,
}: ListToolbarProps) {
  const LayoutIcon = layout === "split" ? ColumnsIcon : RowsIcon;

  return (
    <div
      data-desktop-mac-titlebar-spacer={showSidebarToggle || undefined}
      className="flex shrink-0 items-center gap-2 px-3 pt-3 pb-3"
    >
      {showSidebarToggle ? (
        <SidebarTrigger name="left-sidebar" className="hidden lg:inline-flex" />
      ) : null}

      {/* Selection swaps the toolbar's controls in place so the list never
          shifts down to make room for a new row. */}
      {selectedCount > 0 ? (
        <>
          <span
            aria-live="polite"
            className="min-w-0 flex-1 truncate font-medium text-sm"
          >{`${selectedCount} selected`}</span>

          <Tooltip content={`Archive (${getShortcutHint("archive")})`}>
            <button
              type="button"
              onClick={onArchiveSelected}
              aria-label="Archive"
              className={cn(toolbarButton, "w-8 justify-center px-0")}
            >
              <ArchiveIcon className="size-3.5" />
            </button>
          </Tooltip>

          <Tooltip content={`Delete (${getShortcutHint("delete")})`}>
            <button
              type="button"
              onClick={onDeleteSelected}
              aria-label="Delete"
              className={cn(
                toolbarButton,
                "w-8 justify-center px-0 hover:bg-destructive/10 hover:text-destructive",
              )}
            >
              <Trash2Icon className="size-3.5" />
            </button>
          </Tooltip>

          {onLabelSelected ? (
            <Tooltip content={`Label (${getShortcutHint("label")})`}>
              <button
                type="button"
                onClick={onLabelSelected}
                aria-label="Label"
                className={cn(toolbarButton, "w-8 justify-center px-0")}
              >
                <TagIcon className="size-3.5" />
              </button>
            </Tooltip>
          ) : null}

          <Tooltip
            content={`Clear selection (${getShortcutHint("backToList")})`}
          >
            <button
              type="button"
              onClick={onClearSelection}
              aria-label="Clear selection"
              className={cn(toolbarButton, "w-8 justify-center px-0")}
            >
              <XIcon className="size-3.5" />
            </button>
          </Tooltip>
        </>
      ) : onSearch ? (
        <MailSearchInput searchQuery={searchQuery} onSearch={onSearch} />
      ) : (
        // Opens the command palette rather than searching mail — combined
        // inboxes can't search across accounts yet, so promising search we
        // don't have would mislead.
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
      )}

      {showLayoutToggle && selectedCount === 0 ? (
        <Tooltip
          content={`Switch list / split view (${getShortcutHint("toggleLayout")})`}
        >
          <button
            type="button"
            onClick={onToggleLayout}
            aria-label="Switch list or split view"
            className={cn(toolbarButton, "w-8 justify-center px-0")}
          >
            <LayoutIcon className="size-3.5" />
          </button>
        </Tooltip>
      ) : null}

      {selectedCount === 0 ? (
        <Tooltip content="Assistant">
          <button
            type="button"
            onClick={onToggleAssistant}
            aria-label="Toggle the assistant"
            className={cn(
              toolbarButton,
              "w-8 justify-center border-blue-600 bg-blue-600 px-0 text-white hover:border-blue-700 hover:bg-blue-700 hover:text-white dark:border-blue-700 dark:bg-blue-700 dark:hover:border-blue-800 dark:hover:bg-blue-800",
            )}
          >
            <SparklesIcon className="size-3.5" />
          </button>
        </Tooltip>
      ) : null}
    </div>
  );
}

function MailSearchInput({
  searchQuery,
  onSearch,
}: {
  searchQuery: string;
  onSearch: (query: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <form
      // Remount when the committed query changes elsewhere (sidebar
      // navigation, clearing) so the uncontrolled input tracks it without
      // mirroring the value into state.
      key={searchQuery}
      role="search"
      onSubmit={(event) => {
        event.preventDefault();
        onSearch(inputRef.current?.value.trim() ?? "");
      }}
      className="flex h-8 min-w-0 flex-1 items-center gap-2 rounded-lg border border-border bg-sidebar px-2.5 text-muted-foreground text-sm transition-colors focus-within:border-[hsl(var(--border-strong))] focus-within:bg-background hover:border-[hsl(var(--border-strong))]"
    >
      <SearchIcon className="size-3.5 shrink-0" />
      <input
        ref={inputRef}
        defaultValue={searchQuery}
        placeholder="Search mail"
        enterKeyHint="search"
        aria-label="Search mail"
        className="h-full min-w-0 flex-1 border-0 bg-transparent p-0 text-foreground outline-none focus:ring-0 placeholder:text-muted-foreground"
        onKeyDown={(event) => {
          if (event.key !== "Escape") return;
          if (inputRef.current?.value || searchQuery) {
            if (inputRef.current) inputRef.current.value = "";
            onSearch("");
          } else {
            inputRef.current?.blur();
          }
        }}
      />
      {searchQuery ? (
        <button
          type="button"
          aria-label="Clear search"
          onClick={() => onSearch("")}
          className="shrink-0 rounded p-0.5 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <XIcon className="size-3.5" />
        </button>
      ) : null}
    </form>
  );
}

const toolbarButton =
  "flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-border bg-background px-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
