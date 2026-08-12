"use client";

import { memo, useMemo } from "react";
import { MailLabelChip } from "@/app/(app)/[emailAccountId]/mail/MailLabelChip";
import type {
  ListThread,
  MailLayoutMode,
} from "@/app/(app)/[emailAccountId]/mail/types";
import { EmailDate } from "@/components/email-list/EmailDate";
import { getEmailThreadLabels } from "@/components/EmailMessageCellLabels";
import { getShortcutHint } from "@/lib/shortcuts/registry";
import { Checkbox } from "@/components/ui/checkbox";
import type { EmailLabels } from "@/providers/email-label-types";
import { cn } from "@/utils";
import { internalDateToDate } from "@/utils/date";
import { extractNameFromEmail, participant } from "@/utils/email";
import { decodeSnippet } from "@/utils/gmail/decode";
import { GmailLabel } from "@/utils/gmail/label";
import { isThreadUnread } from "@/app/(app)/[emailAccountId]/mail/thread-read-state";

const SELECT_HINT = getShortcutHint("select");

export type ThreadRowProps = {
  thread: ListThread;
  /** Position in the rendered list — selection and focus are index-addressed. */
  index: number;
  layout: MailLayoutMode;
  userEmail: string;
  userLabels: EmailLabels;
  isFocused: boolean;
  isSelected: boolean;
  /** Keeps every checkbox visible once the list has a selection. */
  hasAnySelection: boolean;
  onOpen: (index: number) => void;
  onToggleSelect: (index: number) => void;
  onSelectRangeTo: (index: number) => void;
};

export const ThreadRow = memo(function ThreadRow({
  thread,
  index,
  layout,
  userEmail,
  userLabels,
  isFocused,
  isSelected,
  hasAnySelection,
  onOpen,
  onToggleSelect,
  onSelectRangeTo,
}: ThreadRowProps) {
  const message = thread.messages.at(-1);

  const labels = useMemo(
    () =>
      getEmailThreadLabels({
        messages: thread.messages,
        userLabels,
      }),
    [thread.messages, userLabels],
  );

  if (!message) return null;

  // Both providers normalise to these ids, so this is not a provider branch.
  const isUnread = isThreadUnread(thread);
  const isDraft = message.labelIds?.includes(GmailLabel.DRAFT) ?? false;
  const isWide = layout === "list";

  const sender = extractNameFromEmail(participant(message, userEmail));
  const subject = message.headers.subject;
  const snippet = decodeSnippet(thread.snippet || message.snippet);
  const chips = labels.slice(0, isWide ? 3 : 2);
  const showCheckbox = isSelected || hasAnySelection;

  const selectionControl = (
    <span className={cn("relative size-3.5 shrink-0", !isWide && "mt-0.5")}>
      <Checkbox
        aria-label={`Select conversation from ${sender}`}
        checked={isSelected}
        className={cn(
          "absolute inset-0 size-3.5 rounded border-input transition-opacity [&_svg]:size-2.5",
          showCheckbox
            ? "opacity-100"
            : "opacity-0 group-focus-within:opacity-100 group-hover:opacity-100",
        )}
        onClick={(event) => {
          event.stopPropagation();
          if (event.shiftKey) onSelectRangeTo(index);
          else onToggleSelect(index);
        }}
        title={`Select (${SELECT_HINT})`}
      />
      <span
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-0 flex items-center justify-center transition-opacity",
          isUnread && !showCheckbox
            ? "opacity-100 group-focus-within:opacity-0 group-hover:opacity-0"
            : "opacity-0",
        )}
      >
        <span className="size-1.5 rounded-full bg-primary" />
      </span>
    </span>
  );

  // `EmailDate` is shared with the old list, which sets a heavier type ramp.
  const date = (
    <EmailDate
      className="font-normal text-xs"
      date={internalDateToDate(message.internalDate)}
    />
  );
  const draftMarker = isDraft ? (
    <span className="shrink-0 text-primary text-sm">Draft</span>
  ) : null;

  return (
    <div
      aria-selected={isSelected}
      className={cn(
        "group relative flex cursor-pointer border-b border-border/60 outline-none",
        isWide
          ? "items-center gap-2.5 py-2.5 pr-5 pl-3"
          : "items-start gap-2 px-3.5 py-2.5",
        rowBackground({ isSelected, isFocused }),
        isFocused &&
          // Inset so the marker reads as a marker rather than a border, and so
          // the first row's doesn't run into the tab bar above it.
          "before:absolute before:inset-y-1 before:left-0 before:w-0.5 before:rounded-full before:bg-primary before:content-['']",
      )}
      onClick={(event) => {
        if (event.shiftKey) onSelectRangeTo(index);
        else onOpen(index);
      }}
      onKeyDown={(event) => {
        if (event.key !== "Enter") return;
        event.preventDefault();
        onOpen(index);
      }}
      role="option"
      tabIndex={isFocused ? 0 : -1}
    >
      {selectionControl}

      {isWide ? (
        <>
          <div className="flex w-48 shrink-0 items-baseline gap-1.5 overflow-hidden whitespace-nowrap">
            <span
              className={cn(
                "truncate text-foreground text-sm",
                isUnread && "font-semibold",
              )}
            >
              {sender}
            </span>
            {draftMarker}
          </div>
          <div className="flex min-w-0 flex-1 items-center gap-2.5">
            {chips.map((label) => (
              <MailLabelChip key={label.id} name={label.name} />
            ))}
            <span
              className={cn(
                "max-w-[46%] shrink-0 truncate whitespace-nowrap text-sm",
                isUnread
                  ? "font-semibold text-foreground"
                  : "font-normal text-muted-foreground",
              )}
            >
              {subject}
            </span>
            <span className="min-w-0 flex-1 truncate text-muted-foreground text-sm">
              {snippet}
            </span>
          </div>
          <div className="w-16 shrink-0 text-right">{date}</div>
        </>
      ) : (
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <div className="flex items-baseline gap-1.5">
            <span
              className={cn(
                "min-w-0 flex-1 truncate text-foreground text-sm",
                isUnread && "font-semibold",
              )}
            >
              {sender}
            </span>
            {draftMarker}
            <div className="ml-auto shrink-0">{date}</div>
          </div>
          <div
            className={cn(
              "truncate text-sm",
              isUnread
                ? "font-semibold text-foreground"
                : "font-normal text-muted-foreground",
            )}
          >
            {subject}
          </div>
          <div className="truncate text-muted-foreground text-xs">
            {snippet}
          </div>
          {chips.length ? (
            <div className="flex flex-wrap gap-1 pt-1">
              {chips.map((label) => (
                <MailLabelChip key={label.id} name={label.name} />
              ))}
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
});

function rowBackground({
  isSelected,
  isFocused,
}: {
  isSelected: boolean;
  isFocused: boolean;
}) {
  if (isSelected) return "bg-primary/10";
  if (isFocused) return "bg-primary/5";
  return "bg-background hover:bg-muted/50";
}
