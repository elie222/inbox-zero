"use client";

import { memo, useMemo, type Ref } from "react";
import { ChevronDownIcon, LayersIcon } from "lucide-react";
import { Trans, useLingui } from "@lingui/react/macro";
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

/** One collapsed row standing in for every inbox thread in a bundle. */
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
  const { t, i18n } = useLingui();
  // A split bundle names who it holds and previews its newest subject. A
  // sender bundle already names its sender, so it lists subjects instead.
  const summary = useMemo(() => {
    if (bundle.kind === "sender") {
      const [newestSubject = "", ...olderSubjects] = new Set(
        bundle.threads.flatMap(
          (thread) => getConversationSubject(thread.messages) || [],
        ),
      );
      return { headline: newestSubject, preview: olderSubjects.join(", ") };
    }
    // Deduplicated in recency order, so the newest senders are named first.
    const senders = new Set(
      bundle.threads.flatMap((thread) =>
        getThreadParticipantNames(
          [...(thread.participantMessages ?? []), ...thread.messages],
          ("account" in thread ? thread.account?.email : null) ?? userEmail,
          t`me`,
        ),
      ),
    );
    return {
      headline: [...senders].join(", "),
      preview: getConversationSubject(bundle.threads[0]?.messages ?? []),
    };
  }, [bundle.kind, bundle.threads, userEmail, t]);
  const newest = bundle.threads[0];
  if (!newest) return null;
  // Zero means no message had a readable date.
  const timestamp = getThreadTimestamp(newest);

  return (
    <MailThreadRow
      countBadge={
        <span className="inline-flex shrink-0 items-center gap-1 self-center rounded-md bg-primary/10 px-1.5 py-px font-medium text-primary text-xs leading-4">
          <LayersIcon aria-hidden className="size-3" />
          {bundle.threads.length}
        </span>
      }
      compact={compact}
      expandedPreview={expandedPreview}
      date={
        <span className="text-muted-foreground text-xs">
          {timestamp
            ? formatShortDate(new Date(timestamp), {
                lowercase: true,
                locale: i18n.locale,
              })
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
          aria-label={ariaLabel}
          checked={checked}
          className={getMailRowCheckboxClassName(visible)}
          onClick={onClick}
        />
      )}
      rowRef={rowRef}
      selectionEnabled={selectionEnabled}
      snippet={summary.preview}
      strings={{
        selectConversation: (bundleName) => t`Select bundle with ${bundleName}`,
      }}
      subject={summary.headline}
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
      <span className="ml-auto">
        <Trans>Collapse</Trans>
      </span>
    </button>
  );
}
