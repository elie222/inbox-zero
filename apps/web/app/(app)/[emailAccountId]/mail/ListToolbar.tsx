"use client";

import { useId, useRef, useState, type RefObject } from "react";
import {
  ArchiveIcon,
  ChevronDownIcon,
  ColumnsIcon,
  RowsIcon,
  SearchIcon,
  SparklesIcon,
  TagIcon,
  TextIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react";
import { MailSearchFiltersForm } from "@/app/(app)/[emailAccountId]/mail/MailSearchFilters";
import {
  MailSearchSuggestionList,
  suggestionOptionId,
  useMailSearchSuggestions,
} from "@/app/(app)/[emailAccountId]/mail/MailSearchSuggestions";
import {
  readRecentSearches,
  rememberRecentSearch,
} from "@/app/(app)/[emailAccountId]/mail/mail-search-history";
import { parseMailSearchQuery } from "@/app/(app)/[emailAccountId]/mail/mail-search-query";
import type { MailLayoutMode } from "@/app/(app)/[emailAccountId]/mail/types";
import { Kbd } from "@/components/Kbd";
import { Tooltip } from "@/components/Tooltip";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { getShortcutHint } from "@/lib/shortcuts/registry";
import { useAccount } from "@/providers/EmailAccountProvider";
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
  /** User labels offered in the Gmail-style Search dropdown. */
  searchLabels?: { name: string }[];
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
  searchLabels,
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
          // Remount when the committed query changes elsewhere (sidebar
          // navigation, clearing) so the draft tracks it without mirroring
          // the value into state.
          key={searchQuery}
          searchQuery={searchQuery}
          onSearch={onSearch}
          inputRef={searchInputRef}
          searchLabels={searchLabels}
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
  searchLabels = [],
}: {
  searchQuery: string;
  onSearch: (query: string) => void;
  inputRef?: RefObject<HTMLInputElement | null>;
  searchLabels?: { name: string }[];
}) {
  const localRef = useRef<HTMLInputElement>(null);
  const inputRef = inputRefProp ?? localRef;
  const { emailAccountId } = useAccount();
  const suggestionListId = useId();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filterDraft, setFilterDraft] = useState(searchQuery);
  const [draft, setDraft] = useState(searchQuery);
  const [focused, setFocused] = useState(false);
  const [suggestionsDismissed, setSuggestionsDismissed] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);

  const suggestions = useMailSearchSuggestions({
    draft,
    emailAccountId,
    enabled: focused && !filtersOpen && !suggestionsDismissed,
    recentSearches,
  });
  const suggestionsOpen = suggestions.length > 0;
  const highlightedIndex = activeIndex < suggestions.length ? activeIndex : -1;

  const commitSearch = (query: string) => {
    const trimmed = query.trim();
    if (trimmed) rememberRecentSearch(emailAccountId, trimmed);
    onSearch(trimmed);
  };

  return (
    <Popover
      modal
      open={filtersOpen}
      onOpenChange={(open) => {
        if (open) setFilterDraft(draft);
        setFiltersOpen(open);
      }}
    >
      <div
        className={cn(
          "group relative flex h-8 min-w-0 flex-1 items-center rounded-lg border border-border bg-sidebar text-muted-foreground text-sm transition-colors focus-within:border-[hsl(var(--border-strong))] focus-within:bg-background hover:border-[hsl(var(--border-strong))]",
          filtersOpen && "border-[hsl(var(--border-strong))] bg-background",
        )}
      >
        <form
          role="search"
          onSubmit={(event) => {
            event.preventDefault();
            commitSearch(draft);
          }}
          className="flex h-full min-w-0 flex-1 items-center gap-2 px-2.5"
        >
          <SearchIcon className="size-3.5 shrink-0" />
          <input
            ref={inputRef}
            value={draft}
            placeholder="Search mail"
            enterKeyHint="search"
            role="combobox"
            aria-label="Search mail"
            aria-autocomplete="list"
            aria-expanded={suggestionsOpen}
            aria-controls={suggestionsOpen ? suggestionListId : undefined}
            aria-activedescendant={
              highlightedIndex >= 0
                ? suggestionOptionId(suggestionListId, highlightedIndex)
                : undefined
            }
            // The forms plugin sizes untyped inputs at 1rem, so the size has
            // to be stated for the field to match the rest of the toolbar.
            className="h-full min-w-0 flex-1 border-0 bg-transparent p-0 text-foreground text-sm outline-none focus:ring-0 placeholder:text-muted-foreground"
            onChange={(event) => {
              setDraft(event.target.value);
              setActiveIndex(-1);
              setSuggestionsDismissed(false);
            }}
            onFocus={() => {
              setRecentSearches(readRecentSearches(emailAccountId));
              setFocused(true);
            }}
            onBlur={() => {
              setFocused(false);
              setActiveIndex(-1);
            }}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown" && suggestionsOpen) {
                event.preventDefault();
                setActiveIndex(
                  Math.min(highlightedIndex + 1, suggestions.length - 1),
                );
                return;
              }
              if (event.key === "ArrowUp" && suggestionsOpen) {
                event.preventDefault();
                setActiveIndex(Math.max(highlightedIndex - 1, -1));
                return;
              }
              if (event.key === "Enter" && highlightedIndex >= 0) {
                event.preventDefault();
                commitSearch(suggestions[highlightedIndex].query);
                return;
              }
              if (event.key !== "Escape") return;
              if (suggestionsOpen) {
                setSuggestionsDismissed(true);
                setActiveIndex(-1);
                return;
              }
              if (filtersOpen) {
                setFiltersOpen(false);
                return;
              }
              if (draft || searchQuery) {
                setDraft("");
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
          ) : !filtersOpen ? (
            <Kbd className="pointer-events-none shrink-0 group-focus-within:invisible">
              {getShortcutHint("search")}
            </Kbd>
          ) : null}
        </form>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label="Show search options"
            aria-expanded={filtersOpen}
            className={cn(
              "flex h-full w-7 shrink-0 items-center justify-center rounded-r-lg text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              filtersOpen && "text-foreground",
            )}
          >
            <ChevronDownIcon
              className={cn(
                "size-3.5 transition-transform",
                filtersOpen && "rotate-180",
              )}
            />
          </button>
        </PopoverTrigger>
        {suggestionsOpen ? (
          <MailSearchSuggestionList
            activeIndex={highlightedIndex}
            id={suggestionListId}
            onSelect={(suggestion) => commitSearch(suggestion.query)}
            suggestions={suggestions}
          />
        ) : null}
      </div>
      <PopoverContent
        align="start"
        sideOffset={6}
        className="w-[min(34rem,calc(100vw-1.5rem))] p-4"
        onPointerDownOutside={(event) => {
          const target = event.target as HTMLElement | null;
          if (target?.closest("[data-radix-select-viewport]")) {
            event.preventDefault();
          }
        }}
      >
        {filtersOpen ? (
          <MailSearchFiltersForm
            key={filterDraft}
            initialFields={parseMailSearchQuery(filterDraft)}
            extraLocations={searchLabels}
            onSearch={(query) => {
              commitSearch(query);
              setFiltersOpen(false);
            }}
          />
        ) : null}
      </PopoverContent>
    </Popover>
  );
}

const toolbarButton =
  "flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-border bg-background px-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
