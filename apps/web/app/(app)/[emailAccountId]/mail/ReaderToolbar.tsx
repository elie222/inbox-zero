"use client";

import type { ReactElement, ReactNode } from "react";
import {
  ArchiveIcon,
  ArrowLeftIcon,
  ChevronsDownUpIcon,
  ChevronsUpDownIcon,
  MailIcon,
  MailOpenIcon,
} from "lucide-react";
import {
  MailReaderToolbar,
  type MailReaderToolbarButton,
} from "@inboxzero/mail-ui/MailReaderSurface";
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
    <MailReaderToolbar
      icons={{
        archive: <ArchiveIcon className="size-3.5" />,
        back: <ArrowLeftIcon className="size-3.5" />,
        collapse_all: <ChevronsDownUpIcon className="size-3.5" />,
        expand_all: <ChevronsUpDownIcon className="size-3.5" />,
        mark_read: <MailOpenIcon className="size-3.5" />,
        mark_unread: <MailIcon className="size-3.5" />,
      }}
      isStarred={isStarred}
      isUnread={isUnread}
      labelChips={labels.map((label) => (
        <MailLabelChip
          color={label.color}
          href={labelHref(label.id)}
          key={label.id}
          name={label.name}
          onRemove={onRemoveLabel ? () => onRemoveLabel(label.id) : undefined}
        />
      ))}
      menu={menu}
      messageExpansion={messageExpansion}
      onArchive={onArchive}
      onBackToInbox={onBackToInbox}
      onMarkRead={onMarkRead}
      onMarkUnread={onMarkUnread}
      renderActionTooltip={renderActionTooltip}
      renderButton={renderButton}
      subject={subject}
    />
  );
}

function renderButton(button: MailReaderToolbarButton) {
  return (
    <Button
      aria-label={button.ariaLabel}
      onClick={button.onClick}
      size="iconXs"
      title={button.title}
      variant={button.variant}
    >
      {button.icon}
    </Button>
  );
}

function renderActionTooltip(
  button: MailReaderToolbarButton,
  children: ReactElement,
) {
  if (button.action === "archive") {
    return <Tooltip shortcuts={["archive"]}>{children}</Tooltip>;
  }
  if (button.action === "mark_unread") {
    return <Tooltip shortcuts={["markUnread"]}>{children}</Tooltip>;
  }
  if (button.action === "mark_read") {
    return <Tooltip content="Mark as read">{children}</Tooltip>;
  }
  return children;
}
