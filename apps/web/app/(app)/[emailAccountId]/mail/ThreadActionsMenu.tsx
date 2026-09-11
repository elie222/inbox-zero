"use client";

import {
  ArchiveIcon,
  ArchiveRestoreIcon,
  ExternalLinkIcon,
  FolderInputIcon,
  MailXIcon,
  MailIcon,
  MailOpenIcon,
  MoreHorizontalIcon,
  ShieldAlertIcon,
  StarIcon,
  StarOffIcon,
  Trash2Icon,
  TagIcon,
} from "lucide-react";
import { useSenderCommands } from "@/app/(app)/[emailAccountId]/mail/use-sender-commands";
import { getEmailMessageCellActions } from "@/components/EmailMessageCellActions";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { getShortcutHint } from "@/lib/shortcuts/registry";
import { useAccount } from "@/providers/EmailAccountProvider";
import { isMicrosoftProvider } from "@/utils/email/provider-types";
import type { ParsedMessage } from "@/utils/types";

export type ThreadActionsMenuProps = {
  message: ParsedMessage | null;
  isUnread: boolean;
  isStarred: boolean;
  onToggleStar: () => void;
  onMarkSpam: () => void;
  onDelete: () => void;
  onMarkRead: () => void;
  onMarkUnread: () => void;
  onLabel?: () => void;
  onMove?: () => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
};

/**
 * Thread-wide actions in the reader toolbar.
 */
export function ThreadActionsMenu({
  message,
  isUnread,
  isStarred,
  onToggleStar,
  onMarkSpam,
  onDelete,
  onMarkRead,
  onMarkUnread,
  onLabel,
  onMove,
  open,
  onOpenChange,
}: ThreadActionsMenuProps) {
  const hint = getShortcutHint("moreActions");
  const { provider, userEmail } = useAccount();
  const {
    canManageAutoArchive,
    isUnsubscribeDisabled,
    unsubscribeLabel,
    isAutoArchived,
    isAutoArchiveStatusLoading,
    isUpdatingAutoArchive,
    onToggleAutoArchive,
    onUnsubscribe,
    PremiumModal,
  } = useSenderCommands(message);
  const openUrl = message
    ? getEmailMessageCellActions({
        externalUrl: message.externalUrl,
        messageId: message.id,
        provider,
        threadId: message.threadId,
        userEmail,
      })?.openUrl
    : undefined;

  return (
    <>
      <DropdownMenu onOpenChange={onOpenChange} open={open}>
        <DropdownMenuTrigger asChild>
          <Button
            aria-label={`More actions (${hint})`}
            className="h-7 w-7"
            size="icon"
            title={`More actions (${hint})`}
            variant="outline"
          >
            <MoreHorizontalIcon className="size-3.5" />
          </Button>
        </DropdownMenuTrigger>

        <DropdownMenuContent
          align="end"
          className="w-80 max-w-[calc(100vw-1rem)]"
          onEscapeKeyDown={(event) => event.stopPropagation()}
        >
          {onLabel && (
            <DropdownMenuItem onSelect={onLabel}>
              <TagIcon className="mr-2 size-4" />
              Label
              <DropdownMenuShortcut>
                {getShortcutHint("label")}
              </DropdownMenuShortcut>
            </DropdownMenuItem>
          )}

          {onMove && (
            <DropdownMenuItem onSelect={onMove}>
              <FolderInputIcon className="mr-2 size-4" />
              Move
              <DropdownMenuShortcut>
                {getShortcutHint("move")}
              </DropdownMenuShortcut>
            </DropdownMenuItem>
          )}

          <DropdownMenuItem onSelect={onToggleStar}>
            {isStarred ? (
              <StarOffIcon className="mr-2 size-4" />
            ) : (
              <StarIcon className="mr-2 size-4" />
            )}
            {isStarred ? "Unstar" : "Star"}
            <DropdownMenuShortcut>
              {getShortcutHint("star")}
            </DropdownMenuShortcut>
          </DropdownMenuItem>

          {isUnread ? (
            <DropdownMenuItem onSelect={onMarkRead}>
              <MailOpenIcon className="mr-2 size-4" />
              Mark as read
            </DropdownMenuItem>
          ) : null}

          <DropdownMenuItem onSelect={onMarkUnread}>
            <MailIcon className="mr-2 size-4" />
            Mark as unread
            <DropdownMenuShortcut>
              {getShortcutHint("markUnread")}
            </DropdownMenuShortcut>
          </DropdownMenuItem>

          <DropdownMenuItem onSelect={onDelete}>
            <Trash2Icon aria-hidden className="mr-2 size-4" />
            Delete
            <DropdownMenuShortcut>
              {getShortcutHint("delete")}
            </DropdownMenuShortcut>
          </DropdownMenuItem>

          <DropdownMenuItem onSelect={onMarkSpam}>
            <ShieldAlertIcon className="mr-2 size-4" />
            Mark as spam
            <DropdownMenuShortcut>
              {getShortcutHint("markSpam")}
            </DropdownMenuShortcut>
          </DropdownMenuItem>

          {canManageAutoArchive ? (
            <DropdownMenuItem
              disabled={isUnsubscribeDisabled}
              onSelect={onUnsubscribe}
            >
              <MailXIcon className="mr-2 size-4" />
              {unsubscribeLabel}
              <DropdownMenuShortcut>
                {getShortcutHint("unsubscribe")}
              </DropdownMenuShortcut>
            </DropdownMenuItem>
          ) : null}

          {canManageAutoArchive ? (
            <DropdownMenuItem
              disabled={isAutoArchiveStatusLoading || isUpdatingAutoArchive}
              onSelect={onToggleAutoArchive}
            >
              {isAutoArchived ? (
                <ArchiveRestoreIcon className="mr-2 size-4" />
              ) : (
                <ArchiveIcon className="mr-2 size-4" />
              )}
              {isAutoArchived
                ? "Disable auto archive"
                : "Auto archive future emails"}
              <DropdownMenuShortcut>
                {getShortcutHint("toggleAutoArchive")}
              </DropdownMenuShortcut>
            </DropdownMenuItem>
          ) : null}

          {openUrl ? (
            <DropdownMenuItem asChild>
              <a href={openUrl} rel="noopener noreferrer" target="_blank">
                <ExternalLinkIcon className="mr-2 size-4" />
                Open in {isMicrosoftProvider(provider) ? "Outlook" : "Gmail"}
                <DropdownMenuShortcut>
                  {getShortcutHint("openExternal")}
                </DropdownMenuShortcut>
              </a>
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>

      <PremiumModal />
    </>
  );
}
