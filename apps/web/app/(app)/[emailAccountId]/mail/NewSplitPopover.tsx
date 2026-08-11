"use client";

import { type FormEvent, useState } from "react";
import { PlusIcon } from "lucide-react";
import { MailSplitKind } from "@/generated/prisma/enums";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/utils";
import { isOutlookInboxSection } from "@/utils/mail/split-query";

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
};

const GROUP_TITLES: { group: NewSplitOptionGroup; title: string }[] = [
  { group: "state", title: "State" },
  { group: "inbox", title: "Inbox" },
  { group: "category", title: "Category" },
  { group: "label", title: "Label" },
];

export function NewSplitPopover({ options, onCreate }: NewSplitPopoverProps) {
  const [open, setOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [name, setName] = useState("");

  const selected = options.find((option) => option.id === selectedId);

  const changeOpen = (next: boolean) => {
    setOpen(next);
    if (!next) {
      setSelectedId(null);
      setName("");
    }
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!selected) return;
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
        <form onSubmit={submit}>
          <p className="mb-2.5 font-medium text-foreground text-xs">
            New split
          </p>

          <div className="mb-3 flex flex-col gap-2.5">
            {GROUP_TITLES.map(({ group, title }) => {
              const groupOptions = options.filter(
                (option) => option.group === group,
              );
              if (!groupOptions.length) return null;

              return (
                <fieldset key={group} className="flex flex-col gap-1.5">
                  <legend className="text-muted-foreground text-xs">
                    {title}
                  </legend>
                  <div className="flex flex-wrap gap-1.5">
                    {groupOptions.map((option) => (
                      <button
                        key={option.id}
                        type="button"
                        aria-pressed={option.id === selectedId}
                        onClick={() => {
                          setSelectedId(option.id);
                          setName(option.name);
                        }}
                        className={cn(
                          "rounded-full border px-2.5 py-0.5 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                          option.id === selectedId
                            ? "border-primary/30 bg-primary/10 text-primary"
                            : "border-border bg-muted text-muted-foreground hover:text-foreground",
                        )}
                      >
                        {option.name}
                      </button>
                    ))}
                  </div>
                </fieldset>
              );
            })}
          </div>

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
              disabled={!selected}
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
      </PopoverContent>
    </Popover>
  );
}

function summarize(option: NewSplitOption | undefined): string {
  if (!option) return "Pick what this split should contain";
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
