"use client";

import { useRef } from "react";
import {
  AlignJustifyIcon,
  ColumnsIcon,
  RowsIcon,
  SearchIcon,
  SparklesIcon,
  TextIcon,
  XIcon,
} from "lucide-react";
import { Kbd } from "@/components/Kbd";
import { Tooltip } from "@/components/Tooltip";
import { SidebarTrigger } from "@/components/ui/sidebar";
import type {
  MailLayoutMode,
  MailListDensityMode,
} from "@/app/(app)/[emailAccountId]/mail/types";
import { getShortcutHint } from "@/lib/shortcuts/registry";
import { cn } from "@/utils";

export type ListToolbarProps = {
  layout: MailLayoutMode;
  density: MailListDensityMode;
  showLayoutToggle?: boolean;
  showDensityToggle?: boolean;
  /** Committed search query. Only meaningful when `onSearch` is provided. */
  searchQuery?: string;
  /** When provided, the toolbar shows a real mail search input. */
  onSearch?: (query: string) => void;
  onOpenSearch: () => void;
  onToggleLayout: () => void;
  onToggleDensity: () => void;
  onToggleAssistant: () => void;
  showSidebarToggle?: boolean;
};

export function ListToolbar({
  layout,
  density,
  showLayoutToggle = true,
  showDensityToggle = true,
  searchQuery = "",
  onSearch,
  onOpenSearch,
  onToggleLayout,
  onToggleDensity,
  onToggleAssistant,
  showSidebarToggle = false,
}: ListToolbarProps) {
  const LayoutIcon = layout === "split" ? ColumnsIcon : RowsIcon;
  const DensityIcon = density === "expanded" ? AlignJustifyIcon : TextIcon;

  return (
    <div
      data-desktop-mac-titlebar-spacer={showSidebarToggle || undefined}
      className="flex shrink-0 items-center gap-2 px-3 pt-3 pb-3"
    >
      {showSidebarToggle ? (
        <SidebarTrigger name="left-sidebar" className="hidden lg:inline-flex" />
      ) : null}

      {onSearch ? (
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

      {showLayoutToggle ? (
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

      {showDensityToggle ? (
        <Tooltip
          content={`Switch compact / expanded snippets (${getShortcutHint("toggleDensity")})`}
        >
          <button
            type="button"
            onClick={onToggleDensity}
            aria-label="Switch compact or expanded snippets"
            aria-pressed={density === "expanded"}
            className={cn(toolbarButton, "w-8 justify-center px-0")}
          >
            <DensityIcon className="size-3.5" />
          </button>
        </Tooltip>
      ) : null}

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
