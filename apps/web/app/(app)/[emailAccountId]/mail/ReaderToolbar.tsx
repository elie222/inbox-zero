"use client";

import type { ReactNode } from "react";
import {
  ArchiveIcon,
  ChevronsDownUpIcon,
  ChevronsUpDownIcon,
  ArrowLeftIcon,
  MailIcon,
  MailOpenIcon,
} from "lucide-react";
import { MailLabelChip } from "@/app/(app)/[emailAccountId]/mail/MailLabelChip";
import type { EmailMessageCellLabel } from "@/components/EmailMessageCellLabels";
import { Tooltip } from "@/components/Tooltip";
import { Button } from "@/components/ui/button";

type ReaderToolbarProps = {
  subject: string;
  isStarred: boolean;
  isUnread: boolean;
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
  onMarkRead: () => void;
  onMarkUnread: () => void;
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
 * Archive and read state stay visible; everything else lives in `menu`.
 */
export function ReaderToolbar({
  subject,
  isStarred,
  isUnread,
  labels,
  labelHref,
  onRemoveLabel,
  onBackToInbox,
  onArchive,
  onMarkRead,
  onMarkUnread,
  menu,
  messageExpansion,
}: ReaderToolbarProps) {
  return (
    <div className="flex flex-wrap items-start gap-x-4 gap-y-3 pb-3">
      <div className="flex items-center gap-1">
        <Button
          aria-label="Back to inbox"
          onClick={onBackToInbox}
          size="iconXs"
          title="Back to inbox"
          variant="ghost"
        >
          <ArrowLeftIcon className="size-3.5" />
        </Button>
      </div>

      <div className="min-w-56 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex min-w-0 items-center gap-2">
            {isStarred && (
              <span
                className="size-1.5 shrink-0 rounded-full bg-yellow-400"
                role="img"
                aria-label="Starred conversation"
                title="Starred conversation"
              />
            )}
            <h1 className="font-title font-medium text-2xl text-foreground leading-tight tracking-tight">
              {subject}
            </h1>
          </div>
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
            size="iconXs"
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
        <Tooltip shortcuts={["archive"]}>
          <Button
            aria-label="Archive"
            onClick={onArchive}
            size="iconXs"
            variant="outline"
          >
            <ArchiveIcon className="size-3.5" />
          </Button>
        </Tooltip>
        <ReadStateButton
          isUnread={isUnread}
          onMarkRead={onMarkRead}
          onMarkUnread={onMarkUnread}
        />
        {menu}
      </div>
    </div>
  );
}

function ReadStateButton({
  isUnread,
  onMarkRead,
  onMarkUnread,
}: {
  isUnread: boolean;
  onMarkRead: () => void;
  onMarkUnread: () => void;
}) {
  const label = isUnread ? "Mark as read" : "Mark as unread";
  const Icon = isUnread ? MailOpenIcon : MailIcon;

  return (
    <Tooltip
      content={isUnread ? label : undefined}
      shortcuts={isUnread ? undefined : ["markUnread"]}
    >
      <Button
        aria-label={label}
        onClick={isUnread ? onMarkRead : onMarkUnread}
        size="iconXs"
        variant="outline"
      >
        <Icon className="size-3.5" />
      </Button>
    </Tooltip>
  );
}
