"use client";

import type { ReactElement, ReactNode } from "react";
import type { I18n, MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react/macro";
import {
  ArchiveIcon,
  ArchiveRestoreIcon,
  ArrowLeftIcon,
  ChevronsDownUpIcon,
  ChevronsUpDownIcon,
  MessageCircleIcon,
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
import { useSidebar } from "@/components/ui/sidebar";
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
  /** Set when the thread is already archived; swaps out the Archive button. */
  onMoveToInbox?: () => void;
  onMarkRead: () => void;
  onMarkUnread: () => void;
  showChat?: boolean;
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
  onMoveToInbox,
  onMarkRead,
  onMarkUnread,
  menu,
  showChat = true,
  messageExpansion,
}: ReaderToolbarProps) {
  const { t, i18n } = useLingui();
  const { toggleSidebar } = useSidebar();
  return (
    <MailReaderToolbar
      icons={{
        archive: <ArchiveIcon className="size-3.5" />,
        back: <ArrowLeftIcon className="size-3.5" />,
        collapse_all: <ChevronsDownUpIcon className="size-3.5" />,
        expand_all: <ChevronsUpDownIcon className="size-3.5" />,
        mark_read: <MailOpenIcon className="size-3.5" />,
        move_to_inbox: <ArchiveRestoreIcon className="size-3.5" />,
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
      menu={
        <>
          {showChat && (
            <Button
              aria-label={t`Chat about this email`}
              title={t`Chat about this email`}
              size="iconXs"
              variant="ghost"
              onClick={() => toggleSidebar(["chat-sidebar"])}
            >
              <MessageCircleIcon className="size-3.5" />
            </Button>
          )}
          {menu}
        </>
      }
      messageExpansion={messageExpansion}
      onArchive={onArchive}
      onMoveToInbox={onMoveToInbox}
      onBackToInbox={onBackToInbox}
      onMarkRead={onMarkRead}
      onMarkUnread={onMarkUnread}
      renderActionTooltip={(button, children) =>
        renderActionTooltip(button, children, i18n)
      }
      renderButton={(button) => renderButton(button, i18n)}
      strings={{
        starredConversation: t`Starred conversation`,
        threadActions: t`Thread actions`,
      }}
      subject={subject}
    />
  );
}

function renderButton(button: MailReaderToolbarButton, i18n: I18n) {
  // The shared toolbar names its buttons in English.
  const label = i18n._(TOOLBAR_BUTTON_LABELS[button.action]);
  return (
    <Button
      aria-label={label}
      onClick={button.onClick}
      size="iconXs"
      title={button.title ? label : undefined}
      variant="ghost"
    >
      {button.icon}
    </Button>
  );
}

function renderActionTooltip(
  button: MailReaderToolbarButton,
  children: ReactElement,
  i18n: I18n,
) {
  if (button.action === "archive") {
    return <Tooltip shortcuts={["archive"]}>{children}</Tooltip>;
  }
  if (button.action === "move_to_inbox") {
    return <Tooltip content={i18n._(msg`Move to inbox`)}>{children}</Tooltip>;
  }
  if (button.action === "mark_unread") {
    return <Tooltip shortcuts={["markUnread"]}>{children}</Tooltip>;
  }
  if (button.action === "mark_read") {
    return <Tooltip content={i18n._(msg`Mark as read`)}>{children}</Tooltip>;
  }
  return children;
}

const TOOLBAR_BUTTON_LABELS: Record<
  MailReaderToolbarButton["action"],
  MessageDescriptor
> = {
  back: msg`Back to inbox`,
  expand_all: msg`Expand all messages`,
  collapse_all: msg`Collapse all messages`,
  archive: msg`Archive`,
  move_to_inbox: msg`Move to inbox`,
  mark_read: msg`Mark as read`,
  mark_unread: msg`Mark as unread`,
};
