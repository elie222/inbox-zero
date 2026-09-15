"use client";

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { BracesIcon } from "lucide-react";
import { cn } from "@/utils";
import {
  filterSnippets,
  initialSnippetSelectionIndex,
  type SnippetMatchItem,
} from "@/utils/snippets/match-snippets";

export type SnippetPickerRef = {
  onKeyDown: (props: { event: KeyboardEvent }) => boolean;
};

type SnippetPickerProps = {
  onQueryChange?: (query: string) => void;
  onSelectCreate: () => void;
  onSelectSnippet: (snippet: SnippetMatchItem) => void;
  query: string;
  snippets: SnippetMatchItem[];
};

export const SnippetPicker = forwardRef<SnippetPickerRef, SnippetPickerProps>(
  function SnippetPicker(
    { onQueryChange, onSelectCreate, onSelectSnippet, query, snippets },
    ref,
  ) {
    const filteredSnippets = useMemo(
      () => filterSnippets(snippets, query),
      [query, snippets],
    );
    const [selectedIndex, setSelectedIndex] = useState(0);
    const itemCount = filteredSnippets.length + 1;

    useEffect(() => {
      setSelectedIndex(
        initialSnippetSelectionIndex({
          createItem: true,
          query,
          snippets: filteredSnippets,
        }),
      );
    }, [query, filteredSnippets]);

    const selectItem = (index: number) => {
      if (index === 0) {
        onSelectCreate();
        return;
      }
      const snippet = filteredSnippets[index - 1];
      if (snippet) onSelectSnippet(snippet);
    };

    useImperativeHandle(ref, () => ({
      onKeyDown: ({ event }) => {
        if (event.key === "ArrowUp") {
          setSelectedIndex((index) => (index + itemCount - 1) % itemCount);
          return true;
        }
        if (event.key === "ArrowDown") {
          setSelectedIndex((index) => (index + 1) % itemCount);
          return true;
        }
        if (event.key === "Enter") {
          event.preventDefault();
          selectItem(selectedIndex);
          return true;
        }
        return false;
      },
    }));

    return (
      <div
        className="z-[100] w-[22rem] overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-md"
        data-snippet-picker=""
      >
        {onQueryChange ? (
          <input
            aria-label="Search snippets"
            className="h-10 w-full border-b bg-transparent px-3 text-sm outline-none placeholder:text-muted-foreground"
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="Search snippets"
            value={query}
          />
        ) : null}
        <div
          aria-label="Snippets"
          className="max-h-64 overflow-auto p-1"
          role="listbox"
        >
          <PickerRow
            selected={selectedIndex === 0}
            onSelect={() => selectItem(0)}
          >
            <BracesIcon className="size-4 shrink-0 text-muted-foreground" />
            <span className="font-medium">Turn into snippet</span>
          </PickerRow>
          {filteredSnippets.map((snippet, index) => (
            <PickerRow
              key={snippet.id}
              selected={selectedIndex === index + 1}
              onSelect={() => selectItem(index + 1)}
            >
              <span className="w-24 shrink-0 truncate font-medium">
                /{snippet.shortcut}
              </span>
              <span className="min-w-0 truncate text-muted-foreground">
                {snippetPreview(snippet.content)}
              </span>
            </PickerRow>
          ))}
          {filteredSnippets.length === 0 ? (
            <p className="px-3 py-2 text-sm text-muted-foreground">
              {snippets.length === 0
                ? "No snippets yet. Save one to reuse it with /."
                : "No matching snippets."}
            </p>
          ) : null}
        </div>
      </div>
    );
  },
);

function PickerRow({
  children,
  onSelect,
  selected,
}: {
  children: ReactNode;
  onSelect: () => void;
  selected: boolean;
}) {
  return (
    <button
      aria-selected={selected}
      className={cn(
        "flex w-full items-center gap-3 rounded-sm px-2 py-1.5 text-left text-sm",
        selected && "bg-muted",
      )}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onSelect}
      role="option"
      type="button"
    >
      {children}
    </button>
  );
}

function snippetPreview(content: string): string {
  return content.replace(/\s+/g, " ").trim();
}
