"use client";

import { useMemo, useState } from "react";
import { ArrowLeftIcon, CheckIcon, PlusIcon, SparklesIcon } from "lucide-react";
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
import { MAX_SPLIT_LABELS } from "@/utils/mail/split-constants";
import { cn } from "@/utils";

export type NewSplitOptionGroup = "state" | "inbox" | "category" | "label";

export type NewSplitOption = {
  /** Unique across every group; identifies the choice, not the split. */
  id: string;
  name: string;
  kind: MailSplitKind;
  /** Label ids or the category key the split filters on. Empty for ALL/UNREAD. */
  values: string[];
  group: NewSplitOptionGroup;
};

export type NewSplitDraft = {
  name: string;
  kind: MailSplitKind;
  values: string[];
};

export type NewSplitSuggestion = {
  optionIds: string[];
  name: string | null;
  reasoning: string;
};

export type NewSplitPopoverProps = {
  options: NewSplitOption[];
  onCreate: (draft: NewSplitDraft) => Promise<boolean>;
  /** Resolves a free-text description into a selection of the options above. */
  onSuggest: (prompt: string) => Promise<NewSplitSuggestion | null>;
  canAddDefaultSplits: boolean;
  canRemoveDefaultSplits: boolean;
  onSetDefaultSplits: (enabled: boolean) => Promise<boolean>;
};

const GROUPS = [
  { group: "state", title: undefined },
  { group: "label", title: "Labels" },
  { group: "inbox", title: "Inbox" },
  { group: "category", title: "Categories" },
] as const satisfies readonly {
  group: NewSplitOptionGroup;
  title?: string;
}[];

const DESCRIBE_EXAMPLES = ["Mail I still owe a reply", "Invoices and receipts"];

const FOOTER_BUTTON_CLASS =
  "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-xs hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function NewSplitPopover({
  options,
  onCreate,
  onSuggest,
  canAddDefaultSplits,
  canRemoveDefaultSplits,
  onSetDefaultSplits,
}: NewSplitPopoverProps) {
  const [open, setOpen] = useState(false);
  const [isDescribing, setIsDescribing] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [nameOverride, setNameOverride] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [isSuggesting, setIsSuggesting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const optionsById = useMemo(
    () => new Map(options.map((option) => [option.id, option])),
    [options],
  );
  const selected = selectedIds.flatMap((id) => {
    const option = optionsById.get(id);
    return option ? [option] : [];
  });
  const name = nameOverride ?? selected.map((option) => option.name).join(", ");
  const isBusy = isSuggesting || isSaving;

  const changeOpen = (next: boolean) => {
    setOpen(next);
    if (next) return;
    setIsDescribing(false);
    setPrompt("");
    setSelectedIds([]);
    setNameOverride(null);
    setNote(null);
  };

  const toggleLabel = (option: NewSplitOption) => {
    if (selectedIds.includes(option.id)) {
      const next = selectedIds.filter((id) => id !== option.id);
      setSelectedIds(next);
      if (!next.length) setNameOverride(null);
      setNote(null);
      return;
    }
    if (selectedIds.length >= MAX_SPLIT_LABELS) {
      setNote(`A tab can cover up to ${MAX_SPLIT_LABELS} labels.`);
      return;
    }
    setSelectedIds([...selectedIds, option.id]);
    setNote(null);
  };

  const createSplit = async (draft: NewSplitDraft) => {
    if (isBusy) return;
    setIsSaving(true);
    try {
      if (await onCreate(draft)) changeOpen(false);
    } finally {
      setIsSaving(false);
    }
  };

  const createFromSelection = () =>
    createSplit({
      name: name.trim().slice(0, 60),
      kind: MailSplitKind.LABEL,
      values: selected.flatMap((option) => option.values),
    });

  const suggest = async () => {
    const trimmedPrompt = prompt.trim();
    if (!trimmedPrompt || isBusy) return;
    setIsSuggesting(true);
    try {
      const suggestion = await onSuggest(trimmedPrompt);
      if (!suggestion) return;
      setNote(suggestion.reasoning);

      const matched = suggestion.optionIds.flatMap((id) => {
        const option = optionsById.get(id);
        return option ? [option] : [];
      });
      const [first] = matched;
      if (!first) return;

      // Only labels combine, so a read state or category is added outright.
      const labels = matched.filter(
        (option) => option.kind === MailSplitKind.LABEL,
      );
      if (!labels.length) {
        await createSplit({
          name: (suggestion.name || first.name).slice(0, 60),
          kind: first.kind,
          values: first.values,
        });
        return;
      }

      setSelectedIds(labels.map((option) => option.id));
      setNameOverride(suggestion.name);
      setIsDescribing(false);
      setPrompt("");
    } finally {
      setIsSuggesting(false);
    }
  };

  const updateDefaultSplits = async (enabled: boolean) => {
    if (isBusy) return;
    setIsSaving(true);
    try {
      if (await onSetDefaultSplits(enabled)) changeOpen(false);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={changeOpen}>
      <PopoverTrigger
        aria-label="New split"
        className="flex size-6 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <PlusIcon className="size-3.5" />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-0 text-foreground">
        {isDescribing ? (
          <div className="space-y-3 p-3">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setIsDescribing(false);
                  setNote(null);
                }}
                aria-label="Back to the split list"
                className="rounded p-0.5 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <ArrowLeftIcon className="size-3.5" />
              </button>
              <span className="font-medium text-xs">Describe a split</span>
            </div>
            <p className="text-muted-foreground text-xs">
              We pick the labels that match. You can change them before the tab
              is added.
            </p>
            <Input
              autoFocus
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== "Enter") return;
                event.preventDefault();
                suggest();
              }}
              placeholder="Anything from customers"
              aria-label="Describe a split"
              maxLength={300}
              disabled={isBusy}
              className="h-8 text-xs"
            />
            <div className="flex flex-wrap gap-1">
              {DESCRIBE_EXAMPLES.map((example) => (
                <button
                  key={example}
                  type="button"
                  onClick={() => setPrompt(example)}
                  disabled={isBusy}
                  className="rounded-full bg-accent px-2 py-0.5 text-muted-foreground text-xs hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {example}
                </button>
              ))}
            </div>
            {note && <p className="text-muted-foreground text-xs">{note}</p>}
            <Button
              size="sm"
              className="w-full"
              onClick={suggest}
              disabled={!prompt.trim() || isBusy}
              loading={isSuggesting}
            >
              Find matching labels
            </Button>
          </div>
        ) : (
          <div>
            <Command filter={filterByName}>
              <CommandInput
                placeholder="Search labels and categories"
                aria-label="Search labels and categories"
                disabled={isBusy}
                className="h-9 text-xs"
              />
              <CommandList className="max-h-56">
                <CommandEmpty className="py-4 text-center text-muted-foreground text-xs">
                  No labels or categories match.
                </CommandEmpty>
                {GROUPS.map(({ group, title }) => {
                  const groupOptions = options.filter(
                    (option) => option.group === group,
                  );
                  if (!groupOptions.length) return null;

                  return (
                    <CommandGroup key={group} heading={title}>
                      {groupOptions.map((option) => {
                        const isLabel = option.kind === MailSplitKind.LABEL;
                        return (
                          <CommandItem
                            key={option.id}
                            value={option.id}
                            keywords={
                              title ? [option.name, title] : [option.name]
                            }
                            onSelect={() =>
                              isLabel
                                ? toggleLabel(option)
                                : createSplit({
                                    name: option.name,
                                    kind: option.kind,
                                    values: option.values,
                                  })
                            }
                            disabled={isBusy}
                            className="gap-2 text-xs"
                          >
                            {isLabel && (
                              <div
                                className={cn(
                                  "flex size-3.5 items-center justify-center rounded-sm border border-primary",
                                  selectedIds.includes(option.id)
                                    ? "bg-primary text-primary-foreground"
                                    : "opacity-50 [&_svg]:invisible",
                                )}
                              >
                                <CheckIcon className="size-3" />
                              </div>
                            )}
                            <span className="truncate">{option.name}</span>
                          </CommandItem>
                        );
                      })}
                    </CommandGroup>
                  );
                })}
              </CommandList>
            </Command>

            <div className="border-border border-t p-1">
              <button
                type="button"
                onClick={() => {
                  setIsDescribing(true);
                  setNote(null);
                }}
                disabled={isBusy}
                className={`${FOOTER_BUTTON_CLASS} text-primary`}
              >
                <SparklesIcon className="size-3.5" />
                Describe a split instead
              </button>
              {canAddDefaultSplits && (
                <button
                  type="button"
                  onClick={() => updateDefaultSplits(true)}
                  disabled={isBusy}
                  className={`${FOOTER_BUTTON_CLASS} text-muted-foreground hover:text-foreground`}
                >
                  Add a tab for each rule label
                </button>
              )}
              {canRemoveDefaultSplits && (
                <button
                  type="button"
                  onClick={() => updateDefaultSplits(false)}
                  disabled={isBusy}
                  className={`${FOOTER_BUTTON_CLASS} text-muted-foreground hover:text-foreground`}
                >
                  Remove the rule label tabs
                </button>
              )}
            </div>

            {selected.length > 0 && (
              <div className="space-y-2 border-border border-t p-3">
                {note && (
                  <p className="text-muted-foreground text-xs">{note}</p>
                )}
                <Input
                  value={name}
                  onChange={(event) => setNameOverride(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key !== "Enter") return;
                    event.preventDefault();
                    createFromSelection();
                  }}
                  placeholder="Tab name"
                  aria-label="Tab name"
                  maxLength={60}
                  disabled={isBusy}
                  className="h-8 text-xs"
                />
                <Button
                  size="sm"
                  className="w-full"
                  onClick={createFromSelection}
                  disabled={!name.trim() || isBusy}
                  loading={isSaving}
                >
                  {selected.length === 1
                    ? "Add tab"
                    : `Add tab for ${selected.length} labels`}
                </Button>
              </div>
            )}
          </div>
        )}
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
