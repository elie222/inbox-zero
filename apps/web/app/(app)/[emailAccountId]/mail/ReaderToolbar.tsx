"use client";

import type { ReactNode } from "react";
import {
  ArchiveIcon,
  ChevronsDownUpIcon,
  ChevronsUpDownIcon,
  ArrowLeftIcon,
} from "lucide-react";
import { MailLabelChip } from "@/app/(app)/[emailAccountId]/mail/MailLabelChip";
import type { EmailMessageCellLabel } from "@/components/EmailMessageCellLabels";
import { Button } from "@/components/ui/button";

type ReaderToolbarProps = {
  subject: string;
  labels: EmailMessageCellLabel[];
  /**
   * Chips navigate to a label's view and nothing else: a label carries no
   * reason, because several rules — or none at all — can put one on a thread.
   * The "why" is rule-scoped and lives in `menu`.
   */
  labelHref: (labelId: string) => string;
  onRemoveLabel?: (labelId: string) => void;
  onBackToInbox: () => void;
  onArchive: () => void;
  /** The ⋯ dropdown, i.e. `ThreadActionsMenu`, composed by the shell. */
  menu?: ReactNode;
  messageExpansion?: {
    allExpanded: boolean;
    canExpand: boolean;
    onToggleAll: () => void;
  };
};

/**
 * The reader's header: what the thread is, and what you can do to it.
 */
export function ReaderToolbar({
  subject,
  labels,
  labelHref,
  onRemoveLabel,
  onBackToInbox,
  onArchive,
  menu,
  messageExpansion,
}: ReaderToolbarProps) {
  return (
    <div className="flex flex-wrap items-start gap-x-4 gap-y-3 pb-3">
      <Button
        aria-label="Back to inbox"
        className="h-7 w-7"
        onClick={onBackToInbox}
        size="icon"
        title="Back to inbox"
        variant="ghost"
      >
        <ArrowLeftIcon className="size-3.5" />
      </Button>

      <div className="min-w-56 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="font-title font-medium text-2xl text-foreground leading-tight tracking-tight">
            {subject}
          </h1>
          {labels.map((label) => (
            <MailLabelChip
              color={label.color}
              href={labelHref(label.id)}
              key={label.id}
              name={label.name}
              onRemove={
                onRemoveLabel ? () => onRemoveLabel(label.id) : undefined
              }
            />
          ))}
        </div>
      </div>

      <div
        aria-label="Thread actions"
        className="ml-auto flex flex-wrap items-center gap-1.5"
        role="group"
      >
        {messageExpansion?.canExpand && (
          <Button
            aria-label={
              messageExpansion.allExpanded
                ? "Collapse all messages"
                : "Expand all messages"
            }
            title={
              messageExpansion.allExpanded
                ? "Collapse all messages"
                : "Expand all messages"
            }
            className="h-7 w-7"
            size="icon"
            variant="ghost"
            onClick={messageExpansion.onToggleAll}
          >
            {messageExpansion.allExpanded ? (
              <ChevronsDownUpIcon className="size-3.5" />
            ) : (
              <ChevronsUpDownIcon className="size-3.5" />
            )}
          </Button>
        )}
        <Button onClick={onArchive} size="xs-2" variant="outline">
          <ArchiveIcon className="mr-1.5 size-3.5" />
          Archive
        </Button>
        {menu}
      </div>
    </div>
  );
}
