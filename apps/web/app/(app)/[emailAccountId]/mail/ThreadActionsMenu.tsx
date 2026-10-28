"use client";

import { useState } from "react";
import {
  ArchiveIcon,
  ArrowBigUpIcon,
  ArchiveRestoreIcon,
  ExternalLinkIcon,
  FolderInputIcon,
  LanguagesIcon,
  MailXIcon,
  MessageSquareIcon,
  MoreHorizontalIcon,
  PrinterIcon,
  ShieldAlertIcon,
  StarIcon,
  StarOffIcon,
  Trash2Icon,
  TagIcon,
  WandSparklesIcon,
} from "lucide-react";
import { RuleDialog } from "@/app/(app)/[emailAccountId]/assistant/RuleDialog";
import { useSenderCommands } from "@/app/(app)/[emailAccountId]/mail/use-sender-commands";
import { getEmailMessageCellActions } from "@/components/EmailMessageCellActions";
import { Kbd } from "@/components/Kbd";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/Tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  getShortcutHint,
  getShortcutKeyLabels,
  type ShortcutId,
} from "@/lib/shortcuts/registry";
import { useAccount } from "@/providers/EmailAccountProvider";
import { ConditionType } from "@/utils/config";
import { extractEmailAddress, extractNameFromEmail } from "@/utils/email";
import { getOpenInMailboxLabel } from "@/utils/url";
import type { ParsedMessage } from "@/utils/types";

export type ThreadActionsMenuProps = {
  message: ParsedMessage | null;
  /** The newest message someone else sent, whose sender a new rule targets. */
  receivedMessage: ParsedMessage | null;
  isStarred: boolean;
  onToggleStar: () => void;
  onMarkSpam: () => void;
  onDelete: () => void;
  onLabel?: () => void;
  onMove?: () => void;
  onTranslate?: () => void;
  onComment?: () => void;
  onPrint?: () => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
};

/**
 * Thread-wide actions in the reader toolbar.
 */
export function ThreadActionsMenu({
  message,
  receivedMessage,
  isStarred,
  onToggleStar,
  onMarkSpam,
  onDelete,
  onLabel,
  onMove,
  onTranslate,
  onComment,
  onPrint,
  open,
  onOpenChange,
}: ThreadActionsMenuProps) {
  const { provider, userEmail } = useAccount();
  const [isRuleDialogOpen, setIsRuleDialogOpen] = useState(false);
  const senderFrom = receivedMessage?.headers.from ?? "";
  const senderEmail = extractEmailAddress(senderFrom);
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
        <Tooltip shortcuts={["moreActions"]}>
          <DropdownMenuTrigger asChild>
            <Button aria-label="More actions" size="iconXs" variant="ghost">
              <MoreHorizontalIcon className="size-3.5" />
            </Button>
          </DropdownMenuTrigger>
        </Tooltip>

        <DropdownMenuContent
          align="end"
          className="w-80 max-w-[calc(100vw-1rem)]"
          onEscapeKeyDown={(event) => event.stopPropagation()}
        >
          {onLabel && (
            <DropdownMenuItem onSelect={onLabel}>
              <TagIcon className="mr-2 size-4" />
              Label
              <MenuShortcut id="label" />
            </DropdownMenuItem>
          )}

          {onMove && (
            <DropdownMenuItem onSelect={onMove}>
              <FolderInputIcon className="mr-2 size-4" />
              Move
              <MenuShortcut id="move" />
            </DropdownMenuItem>
          )}

          <DropdownMenuItem onSelect={onToggleStar}>
            {isStarred ? (
              <StarOffIcon className="mr-2 size-4" />
            ) : (
              <StarIcon className="mr-2 size-4" />
            )}
            {isStarred ? "Unstar" : "Star"}
            <MenuShortcut id="star" />
          </DropdownMenuItem>

          <DropdownMenuSeparator />

          <DropdownMenuItem onSelect={onDelete}>
            <Trash2Icon aria-hidden className="mr-2 size-4" />
            Delete
            <MenuShortcut id="delete" />
          </DropdownMenuItem>

          <DropdownMenuItem onSelect={onMarkSpam}>
            <ShieldAlertIcon className="mr-2 size-4" />
            Mark as spam
            <MenuShortcut id="markSpam" />
          </DropdownMenuItem>

          {canManageAutoArchive ? (
            <DropdownMenuItem
              disabled={isUnsubscribeDisabled}
              onSelect={onUnsubscribe}
            >
              <MailXIcon className="mr-2 size-4" />
              {unsubscribeLabel}
              <MenuShortcut id="unsubscribe" />
            </DropdownMenuItem>
          ) : null}

          {(onTranslate ||
            onComment ||
            onPrint ||
            canManageAutoArchive ||
            senderEmail) && <DropdownMenuSeparator />}

          {onComment && (
            <DropdownMenuItem onSelect={onComment}>
              <MessageSquareIcon className="mr-2 size-4" />
              Comment
              <MenuShortcut id="openTeamComments" />
            </DropdownMenuItem>
          )}

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
              <MenuShortcut id="toggleAutoArchive" />
            </DropdownMenuItem>
          ) : null}

          {senderEmail ? (
            <DropdownMenuItem onSelect={() => setIsRuleDialogOpen(true)}>
              <WandSparklesIcon className="mr-2 size-4" />
              Create rule for sender
            </DropdownMenuItem>
          ) : null}

          {onTranslate && (
            <DropdownMenuItem onSelect={onTranslate}>
              <LanguagesIcon className="mr-2 size-4" />
              Translate
              <MenuShortcut id="translate" />
            </DropdownMenuItem>
          )}

          {onPrint && (
            <DropdownMenuItem onSelect={onPrint}>
              <PrinterIcon className="mr-2 size-4" />
              Print
            </DropdownMenuItem>
          )}

          {openUrl ? <DropdownMenuSeparator /> : null}

          {openUrl ? (
            <DropdownMenuItem asChild>
              <a href={openUrl} rel="noopener noreferrer" target="_blank">
                <ExternalLinkIcon className="mr-2 size-4" />
                {getOpenInMailboxLabel(provider) ?? "Open in email provider"}
                <MenuShortcut id="openExternal" />
              </a>
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>

      <PremiumModal />

      {senderEmail ? (
        <RuleDialog
          isOpen={isRuleDialogOpen}
          onClose={() => setIsRuleDialogOpen(false)}
          initialRule={{
            name: `Emails from ${extractNameFromEmail(senderFrom)}`,
            conditions: [{ type: ConditionType.STATIC, from: senderEmail }],
          }}
        />
      ) : null}
    </>
  );
}

function MenuShortcut({ id }: { id: ShortcutId }) {
  return (
    <span className="ml-auto flex items-center gap-1">
      <span className="sr-only">{getShortcutHint(id)}</span>
      {getShortcutKeyLabels(id).map((key, index) => (
        <Kbd
          aria-hidden
          className="h-5 min-w-5 px-1.5 font-sans text-[11px]"
          key={`${index}-${key}`}
        >
          {key === "shift" ? <ArrowBigUpIcon className="size-3.5" /> : key}
        </Kbd>
      ))}
    </span>
  );
}
