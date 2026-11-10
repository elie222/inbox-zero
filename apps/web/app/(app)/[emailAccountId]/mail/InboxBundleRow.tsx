"use client";

import { memo, useMemo, type Ref } from "react";
import { ChevronDownIcon, LayersIcon } from "lucide-react";
import { MailThreadRow } from "@inboxzero/mail-ui/MailThreadRow";
import type { InboxBundle } from "@/app/(app)/[emailAccountId]/mail/inbox-bundles";
import { isThreadUnread } from "@/app/(app)/[emailAccountId]/mail/read-state";
import { getMailRowCheckboxClassName } from "@/app/(app)/[emailAccountId]/mail/SelectAllCheckbox";
import { getThreadParticipantNames } from "@/app/(app)/[emailAccountId]/mail/thread-participants";
import type { MailLayoutMode } from "@/app/(app)/[emailAccountId]/mail/types";
import { Checkbox } from "@/components/ui/checkbox";
import { formatShortDate } from "@/utils/date";
import { getConversationSubject } from "@/utils/email/subject";
import { getThreadTimestamp } from "@/utils/threads/sort";

/** One collapsed row standing in for every inbox thread in a bundled split. */
export const InboxBundleRow = memo(function InboxBundleRow({
  bundle,
  index,
  layout,
  userEmail,
  isFocused,
  isSelected,
  hasAnySelection,
  compact,
  expandedPreview,
  selectionEnabled,
  onOpen,
  onToggleSelect,
  onSelectRangeTo,
  rowRef,
}: {
  bundle: InboxBundle;
  index: number;
  layout: MailLayoutMode;
  userEmail: string;
  isFocused: boolean;
  isSelected: boolean;
  hasAnySelection: boolean;
  compact: boolean;
  expandedPreview: boolean;
  selectionEnabled: boolean;
  onOpen: (index: number) => void;
  onToggleSelect: (index: number) => void;
  onSelectRangeTo: (index: number) => void;
  rowRef?: Ref<HTMLDivElement>;
}) {
  const senders = useMemo(
    () =>
      // Deduplicated in recency order, so the newest senders are named first.
      [
        ...new Set(
          bundle.threads.flatMap((thread) =>
            getThreadParticipantNames(
              [...(thread.participantMessages ?? []), ...thread.messages],
              ("account" in thread ? thread.account?.email : null) ?? userEmail,
            ),
          ),
        ),
      ],
    [bundle.threads, userEmail],
  );
  const newest = bundle.threads[0];
  if (!newest) return null;
  // Zero means no message had a readable date.
  const timestamp = getThreadTimestamp(newest);

  return (
    <MailThreadRow
      accountAvatar={
        <LayersIcon aria-hidden className="size-3.5 shrink-0 text-primary" />
      }
      compact={compact}
      expandedPreview={expandedPreview}
      date={
        <span className="text-muted-foreground text-xs">
          {timestamp
            ? formatShortDate(new Date(timestamp), { lowercase: true })
            : null}
        </span>
      }
      hasAnySelection={hasAnySelection}
      index={index}
      isDraft={false}
      isFocused={isFocused}
      isSelected={isSelected}
      isStarred={false}
      isUnread={bundle.threads.some((thread) =>
        isThreadUnread(thread.messages),
      )}
      layout={layout}
      messageCount={bundle.threads.length}
      onOpen={onOpen}
      onSelectRangeTo={onSelectRangeTo}
      onToggleSelect={onToggleSelect}
      participantSummary={bundle.name}
      renderSelectionControl={({ ariaLabel, checked, onClick, visible }) => (
        <Checkbox
          aria-label={ariaLabel.replace("conversation", "bundle")}
          checked={checked}
          className={getMailRowCheckboxClassName(visible)}
          onClick={onClick}
        />
      )}
      rowRef={rowRef}
      selectionEnabled={selectionEnabled}
      snippet={getConversationSubject(newest.messages)}
      subject={senders.join(", ")}
    />
  );
});

/** Sits above an expanded bundle's threads so the reader can fold it back. */
export function InboxBundleHeader({
  bundle,
  onCollapse,
}: {
  bundle: InboxBundle;
  /** Told whether the keyboard did it, so focus can follow to the row. */
  onCollapse: (fromKeyboard: boolean) => void;
}) {
  return (
    <button
      className="flex w-full items-center gap-1.5 border-border/40 border-b bg-muted/40 py-1.5 pr-5 pl-3 text-left text-muted-foreground text-xs hover:bg-muted"
      // A keyboard activation reports no clicks.
      onClick={(event) => onCollapse(event.detail === 0)}
      type="button"
    >
      <ChevronDownIcon aria-hidden className="size-3.5" />
      <LayersIcon aria-hidden className="size-3.5 text-primary" />
      <span className="font-medium text-foreground">{bundle.name}</span>
      <span>{bundle.threads.length}</span>
      <span className="ml-auto">Collapse</span>
    </button>
  );
}
