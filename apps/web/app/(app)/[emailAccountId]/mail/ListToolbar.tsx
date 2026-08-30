"use client";

import { useRef } from "react";
import {
  ColumnsIcon,
  RowsIcon,
  SearchIcon,
  SparklesIcon,
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
        className="h-full min-w-0 flex-1 bg-transparent text-foreground outline-none placeholder:text-muted-foreground"
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
