"use client";

import { type FormEvent, useState } from "react";
import { CheckIcon, Loader2Icon, PlusIcon, SparklesIcon } from "lucide-react";
import { MailSplitKind } from "@/generated/prisma/enums";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/utils";
import { isOutlookInboxSection } from "@/utils/mail/outlook-inbox";

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
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [name, setName] = useState("");

  const selected = options.find((option) => option.id === selectedId);

  const changeOpen = (next: boolean) => {
    setOpen(next);
    if (!next) {
      setPrompt("");
      setSelectedId(null);
      setName("");
    }
  };

  const submitPrompt = async (event: FormEvent) => {
    event.preventDefault();
    const trimmed = prompt.trim();
    if (!trimmed || isCreating) return;
    setIsCreating(true);
    try {
      const created = await onCreateFromPrompt(trimmed);
      if (created) changeOpen(false);
    } finally {
      setIsCreating(false);
    }
  };

  const submitSelection = (event: FormEvent) => {
    event.preventDefault();
    if (!selected || isCreating) return;
    onCreate({
      name: name.trim() || selected.name,
      kind: selected.kind,
      value: selected.value,
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
      <PopoverContent align="start" className="w-80 p-3 text-foreground">
        <p className="mb-2.5 font-medium text-foreground text-xs">New split</p>

        <form onSubmit={submitPrompt} className="mb-2.5 flex gap-1.5">
          <Input
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            placeholder='Describe it, e.g. "receipts" or "unread"'
            aria-label="Describe this split"
            maxLength={300}
            disabled={isCreating}
            className="h-8 text-xs"
          />
          <Button
            type="submit"
            variant="gradient"
            size="xs-2"
            aria-label="Create split from description"
            disabled={!prompt.trim() || isCreating}
          >
            {isCreating ? (
              <Loader2Icon className="size-3.5 animate-spin" />
            ) : (
              <SparklesIcon className="size-3.5" />
            )}
          </Button>
        </form>

        <p className="mb-1.5 text-muted-foreground text-xs">Or pick one:</p>

        <Command
          filter={filterByName}
          className="mb-2.5 rounded-lg border border-border"
        >
          <CommandInput
            placeholder="Search labels and categories"
            className="h-8 text-xs"
          />
          <CommandList className="max-h-44">
            <CommandEmpty className="py-3 text-center text-muted-foreground text-xs">
              No matches
            </CommandEmpty>
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
                      onSelect={() => {
                        setSelectedId(option.id);
                        setName(option.name);
                      }}
                      className="text-xs"
                    >
                      {option.name}
                      <CheckIcon
                        className={cn(
                          "ml-auto size-3.5",
                          option.id === selectedId
                            ? "opacity-100"
                            : "opacity-0",
                        )}
                      />
                    </CommandItem>
                  ))}
                </CommandGroup>
              );
            })}
          </CommandList>
        </Command>

        {selected && (
          <form onSubmit={submitSelection}>
            <p className="mb-2.5 rounded-lg border border-border bg-muted px-2.5 py-2 text-muted-foreground text-xs">
              {summarize(selected)}
            </p>

            <Input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Name this split"
              aria-label="Split name"
              className="mb-2.5 h-8 text-xs"
            />

            <div className="flex gap-2">
              <Button
                type="submit"
                variant="gradient"
                size="xs-2"
                disabled={isCreating}
              >
                Add split
              </Button>
              <Button
                type="button"
                variant="outline"
                size="xs-2"
                onClick={() => changeOpen(false)}
              >
                Cancel
              </Button>
            </div>
          </form>
        )}
      </PopoverContent>
    </Popover>
  );
}

// Match on the option's name and group only; the default cmdk filter would also
// match against the value string, which is an opaque label id here.
function filterByName(
  _value: string,
  search: string,
  keywords?: string[],
): number {
  const haystack = (keywords ?? []).join(" ").toLowerCase();
  return haystack.includes(search.toLowerCase().trim()) ? 1 : 0;
}

function summarize(option: NewSplitOption): string {
  switch (option.kind) {
    case MailSplitKind.INBOX:
      return "Shows everything in the inbox";
    case MailSplitKind.UNREAD:
      return "Shows unread mail";
    case MailSplitKind.CATEGORY:
      if (option.value && isOutlookInboxSection(option.value)) {
        return `Shows ${option.name} inbox mail`;
      }
      return `Shows mail in the ${option.name} category`;
    default:
      return `Shows mail labelled ${option.name}`;
  }
}
