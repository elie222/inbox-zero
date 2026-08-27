"use client";

import { useState } from "react";
import { Loader2Icon, PlusIcon, SparklesIcon } from "lucide-react";
import type { MailSplitKind } from "@/generated/prisma/enums";
import {
  Command,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

/** Display grouping only — "To reply" is a LABEL split that belongs under State. */
export type NewSplitOptionGroup = "state" | "inbox" | "category" | "label";

export type NewSplitOption = {
  /** Unique across every group; identifies the choice, not the split. */
  id: string;
  name: string;
  kind: MailSplitKind;
  /** Label id or category key the split filters on. `null` for ALL/UNREAD. */
  value: string | null;
  group: NewSplitOptionGroup;
};

export type NewSplitDraft = {
  name: string;
  kind: MailSplitKind;
  value: string | null;
};

export type NewSplitPopoverProps = {
  options: NewSplitOption[];
  onCreate: (draft: NewSplitDraft) => void;
  /** Resolves a free-text description into a split. Returns whether it succeeded. */
  onCreateFromPrompt: (prompt: string) => Promise<boolean>;
};

const GROUP_TITLES: { group: NewSplitOptionGroup; title: string }[] = [
  { group: "state", title: "State" },
  { group: "inbox", title: "Inbox" },
  { group: "category", title: "Category" },
  { group: "label", title: "Label" },
];

export function NewSplitPopover({
  options,
  onCreate,
  onCreateFromPrompt,
}: NewSplitPopoverProps) {
  const [open, setOpen] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const trimmedPrompt = prompt.trim();
  const normalizedPrompt = trimmedPrompt.toLowerCase();
  const hasMatchingOption = options.some((option) => {
    const groupTitle = GROUP_TITLES.find(
      ({ group }) => group === option.group,
    )?.title;
    return `${option.name} ${groupTitle ?? ""}`
      .toLowerCase()
      .includes(normalizedPrompt);
  });

  const changeOpen = (next: boolean) => {
    setOpen(next);
    if (!next) setPrompt("");
  };

  const createFromPrompt = async () => {
    if (!trimmedPrompt || isCreating) return;
    setIsCreating(true);
    try {
      const created = await onCreateFromPrompt(trimmedPrompt);
      if (created) changeOpen(false);
    } finally {
      setIsCreating(false);
    }
  };

  const createFromOption = (option: NewSplitOption) => {
    if (isCreating) return;
    onCreate({
      name: option.name,
      kind: option.kind,
      value: option.value,
    });
    changeOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={changeOpen}>
      <PopoverTrigger
        aria-label="New split"
        className="flex size-6 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <PlusIcon className="size-3.5" />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-0 text-foreground">
        <Command filter={filterByName}>
          <CommandInput
            value={prompt}
            onValueChange={setPrompt}
            placeholder="Search or describe a split"
            aria-label="Search or describe a split"
            maxLength={300}
            disabled={isCreating}
            className="h-9 text-xs"
          />
          <CommandList className="max-h-56">
            {trimmedPrompt && !hasMatchingOption && (
              <CommandGroup forceMount>
                <CommandItem
                  forceMount
                  value={`create:${trimmedPrompt}`}
                  onSelect={createFromPrompt}
                  disabled={isCreating}
                  className="gap-2 text-xs"
                >
                  {isCreating ? (
                    <Loader2Icon className="size-3.5 animate-spin text-muted-foreground" />
                  ) : (
                    <SparklesIcon className="size-3.5 text-muted-foreground" />
                  )}
                  <span className="truncate">
                    Create &ldquo;{trimmedPrompt}&rdquo;
                  </span>
                </CommandItem>
              </CommandGroup>
            )}

            {GROUP_TITLES.map(({ group, title }) => {
              const groupOptions = options.filter(
                (option) => option.group === group,
              );
              if (!groupOptions.length) return null;

              return (
                <CommandGroup key={group} heading={title}>
                  {groupOptions.map((option) => (
                    <CommandItem
                      key={option.id}
                      value={option.id}
                      keywords={[option.name, title]}
                      onSelect={() => createFromOption(option)}
                      disabled={isCreating}
                      className="text-xs"
                    >
                      {option.name}
                    </CommandItem>
                  ))}
                </CommandGroup>
              );
            })}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function filterByName(
  _value: string,
  search: string,
  keywords?: string[],
): number {
  const haystack = (keywords ?? []).join(" ").toLowerCase();
  return haystack.includes(search.toLowerCase().trim()) ? 1 : 0;
}
