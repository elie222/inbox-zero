"use client";

import { useRef, type RefObject } from "react";
import {
  ArchiveIcon,
  ColumnsIcon,
  RowsIcon,
  SearchIcon,
  SparklesIcon,
  TagIcon,
  TextIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react";
import { Kbd } from "@/components/Kbd";
import { Tooltip } from "@/components/Tooltip";
import { Checkbox } from "@/components/ui/checkbox";
import type { MailLayoutMode } from "@/app/(app)/[emailAccountId]/mail/types";
import { getShortcutHint } from "@/lib/shortcuts/registry";
import { cn } from "@/utils";

export type ListToolbarProps = {
  layout: MailLayoutMode;
  showLayoutToggle?: boolean;
  expandedPreview: boolean;
  /** Committed search query. */
  searchQuery: string;
  onSearch: (query: string) => void;
  /** Lets `/` focus the mail search field from the shortcut handler. */
  searchInputRef?: RefObject<HTMLInputElement | null>;
  onToggleLayout: () => void;
  onTogglePreview: () => void;
  onToggleAssistant: () => void;
  threadCount: number;
  selectedCount: number;
  onSelectAll: () => void;
  onArchiveSelected: () => void;
  onDeleteSelected: () => void;
  /** Omitted when the current view can't label (combined inboxes). */
  onLabelSelected?: () => void;
  onClearSelection: () => void;
};

export function ListToolbar({
  layout,
  showLayoutToggle = true,
  expandedPreview,
  searchQuery = "",
  onSearch,
  searchInputRef,
  onToggleLayout,
  onTogglePreview,
  onToggleAssistant,
  threadCount,
  selectedCount,
  onSelectAll,
  onArchiveSelected,
  onDeleteSelected,
  onLabelSelected,
  onClearSelection,
}: ListToolbarProps) {
  const LayoutIcon = layout === "split" ? ColumnsIcon : RowsIcon;
  const allSelected = threadCount > 0 && selectedCount === threadCount;
  let selectAllState: boolean | "indeterminate" = false;
  if (allSelected) {
    selectAllState = true;
  } else if (selectedCount > 0) {
    selectAllState = "indeterminate";
  }

  return (
    <div className="flex shrink-0 items-center gap-2 px-3 pt-3 pb-3">
      <Tooltip
        content={
          allSelected
            ? "Deselect all conversations"
            : "Select all conversations"
        }
      >
        <Checkbox
          aria-label="Select all conversations"
          checked={selectAllState}
          className="size-4 rounded border-input"
          disabled={threadCount === 0}
          onCheckedChange={(checked) => {
            if (checked === true) {
              onSelectAll();
            } else {
              onClearSelection();
            }
          }}
        />
      </Tooltip>

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
      ) : (
        <MailSearchInput
          searchQuery={searchQuery}
          onSearch={onSearch}
          inputRef={searchInputRef}
        />
      )}

      {selectedCount === 0 ? (
        <Tooltip
          content={`${expandedPreview ? "Shorten" : "Expand"} preview text (${getShortcutHint("togglePreview")})`}
        >
          <button
            type="button"
            onClick={onTogglePreview}
            aria-label="Expand or shorten preview text"
            aria-pressed={expandedPreview}
            className={cn(
              toolbarButton,
              "w-8 justify-center px-0",
              expandedPreview && "bg-muted text-foreground",
            )}
          >
            <TextIcon className="size-3.5" />
          </button>
        </Tooltip>
      ) : null}

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
  inputRef: inputRefProp,
}: {
  searchQuery: string;
  onSearch: (query: string) => void;
  inputRef?: RefObject<HTMLInputElement | null>;
}) {
  const localRef = useRef<HTMLInputElement>(null);
  const inputRef = inputRefProp ?? localRef;

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
      className="group flex h-8 min-w-0 flex-1 items-center gap-2 rounded-lg border border-border bg-sidebar px-2.5 text-muted-foreground text-sm transition-colors focus-within:border-[hsl(var(--border-strong))] focus-within:bg-background hover:border-[hsl(var(--border-strong))]"
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
      ) : (
        <Kbd className="pointer-events-none shrink-0 group-focus-within:invisible">
          {getShortcutHint("search")}
        </Kbd>
      )}
    </form>
  );
}

const toolbarButton =
  "flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-border bg-background px-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
