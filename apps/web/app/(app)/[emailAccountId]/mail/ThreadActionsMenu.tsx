"use client";

import type { ComponentProps } from "react";
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
  SparklesIcon,
  Trash2Icon,
  TagIcon,
} from "lucide-react";
import { FixWithChat } from "@/app/(app)/[emailAccountId]/assistant/FixWithChat";
import { getRuleResultReasonDisplay } from "@/app/(app)/[emailAccountId]/assistant/ResultDisplay";
import { MailLabelChip } from "@/app/(app)/[emailAccountId]/mail/MailLabelChip";
import type { ThreadPlan } from "@/app/(app)/[emailAccountId]/mail/types";
import { useUnsubscribeSender } from "@/app/(app)/[emailAccountId]/mail/use-unsubscribe-sender";
import { getEmailMessageCellActions } from "@/components/EmailMessageCellActions";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuPortal,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ActionType, ExecutedRuleStatus } from "@/generated/prisma/enums";
import { getShortcutHint } from "@/lib/shortcuts/registry";
import { useAccount } from "@/providers/EmailAccountProvider";
import { ACTION_TYPE_LABELS, getVisibleActions } from "@/utils/action-display";
import { isMicrosoftProvider } from "@/utils/email/provider-types";
import type { ParsedMessage } from "@/utils/types";

type FixWithChatResults = ComponentProps<typeof FixWithChat>["results"];

export type ThreadActionsMenuProps = {
  /**
   * Every rule that fired on the thread, newest first. Attribution is
   * rule-scoped, not label-scoped: one entry per rule, each with its own reason,
   * the actions it applied, and its own way to correct it.
   */
  plans: ThreadPlan[];
  /**
   * The thread's latest message: what the fix flow reasons about, and the
   * sender the unsubscribe entry acts on.
   */
  message: ParsedMessage | null;
  /** `setInput` from `useChat()`: the fix flow seeds the assistant with it. */
  setChatInput: (input: string) => void;
  isUnread: boolean;
  onMarkSpam: () => void;
  onDelete: () => void;
  onMarkRead: () => void;
  onMarkUnread: () => void;
  onLabel?: () => void;
  onMove?: () => void;
  /** Chat remains scoped to the route account, so cross-account rows hide it. */
  showFixWithChat?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
};

/**
 * The reader's ⋯ menu: why the thread looks the way it does, and everything you
 * can do to it that isn't worth a button of its own.
 */
export function ThreadActionsMenu({
  plans,
  message,
  setChatInput,
  isUnread,
  onMarkSpam,
  onDelete,
  onMarkRead,
  onMarkUnread,
  onLabel,
  onMove,
  showFixWithChat = true,
  open,
  onOpenChange,
}: ThreadActionsMenuProps) {
  const hint = getShortcutHint("moreActions");
  const { provider, userEmail } = useAccount();
  const {
    canManageAutoArchive,
    canUnsubscribe,
    isAutoArchived,
    isAutoArchiveStatusLoading,
    isUpdatingAutoArchive,
    onToggleAutoArchive,
    onUnsubscribe,
    PremiumModal,
  } = useUnsubscribeSender(message, { loadStoredLink: Boolean(open) });
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
          className="w-56"
          onEscapeKeyDown={(event) => event.stopPropagation()}
        >
          {plans.length > 0 ? (
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <SparklesIcon className="mr-2 size-4" />
                Matched reason
              </DropdownMenuSubTrigger>
              <DropdownMenuPortal>
                <DropdownMenuSubContent className="max-h-[var(--radix-dropdown-menu-content-available-height)] w-[min(24rem,calc(100vw-1rem))] overflow-y-auto p-0">
                  {plans.map((plan) => (
                    <RuleAttribution
                      key={plan.id}
                      message={message}
                      plan={plan}
                      setChatInput={setChatInput}
                      showFixWithChat={showFixWithChat}
                    />
                  ))}
                </DropdownMenuSubContent>
              </DropdownMenuPortal>
            </DropdownMenuSub>
          ) : null}

          {plans.length > 0 ? <DropdownMenuSeparator /> : null}

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
              disabled={!canUnsubscribe}
              onSelect={onUnsubscribe}
            >
              <MailXIcon className="mr-2 size-4" />
              Unsubscribe from sender
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

function RuleAttribution({
  plan,
  message,
  setChatInput,
  showFixWithChat,
}: {
  plan: ThreadPlan;
  message: ParsedMessage | null;
  setChatInput: (input: string) => void;
  showFixWithChat: boolean;
}) {
  const actions = getVisibleActions(plan.actionItems);
  const labels = actions.filter(
    (action) => action.type === ActionType.LABEL && action.label,
  );
  const otherActions = actions.filter(
    (action) => action.type !== ActionType.LABEL,
  );
  const reasonDisplay = getRuleResultReasonDisplay(plan.reason ?? "");

  return (
    <div className="min-w-0 border-border border-b px-3 py-3 last:border-b-0">
      <div className="min-w-0 text-xs">
        <span className="text-muted-foreground">
          {plan.status === ExecutedRuleStatus.APPLIED
            ? "Applied rule:"
            : "Matched rule:"}{" "}
        </span>
        <span className="font-medium text-foreground break-words [overflow-wrap:anywhere]">
          {plan.rule?.name ?? "a deleted rule"}
        </span>
      </div>

      {reasonDisplay.reason ? (
        <p className="mt-1.5 whitespace-pre-wrap text-foreground text-xs leading-relaxed break-words [overflow-wrap:anywhere]">
          {reasonDisplay.reason}
        </p>
      ) : null}

      {reasonDisplay.actionFailureMessages.length > 0 ? (
        <div className="mt-2 rounded-md bg-destructive/10 px-2 py-1.5 text-destructive text-xs">
          <div className="font-medium">
            {reasonDisplay.actionFailureMessages.length === 1
              ? "Action issue"
              : "Action issues"}
          </div>
          <ul className="mt-0.5 list-disc space-y-0.5 pl-4">
            {reasonDisplay.actionFailureMessages.map(
              (failureMessage, failureIndex) => (
                <li
                  className="break-words [overflow-wrap:anywhere]"
                  key={`${failureMessage}-${failureIndex}`}
                >
                  {failureMessage}
                </li>
              ),
            )}
          </ul>
        </div>
      ) : null}

      {labels.length > 0 || otherActions.length > 0 ? (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {labels.map((action) => (
            <MailLabelChip key={action.id} name={action.label ?? ""} />
          ))}
          {otherActions.map((action) => (
            <span className="text-muted-foreground text-xs" key={action.id}>
              {ACTION_TYPE_LABELS[action.type]}
            </span>
          ))}
        </div>
      ) : null}

      {message && showFixWithChat ? (
        <div className="mt-2.5">
          <FixWithChat
            message={message}
            results={toFixResults(plan)}
            setInput={setChatInput}
          />
        </div>
      ) : null}
    </div>
  );
}

/**
 * `ThreadPlan` has no `createdAt`: the list route uses it to pick each rule's
 * latest execution and then drops it. `ResultsDisplay`, inside `FixWithChat`,
 * still requires one — but only as the key it groups and orders batches by, and
 * never renders it. Each menu entry passes a single result, so grouping has
 * nothing to do and any constant serves; a sentinel is honest about the
 * execution time being unknown here, where a real date would be invented.
 */
const FIX_RESULT_BATCH = new Date(0);

function toFixResults(plan: ThreadPlan): FixWithChatResults {
  return [
    {
      rule: plan.rule,
      actionItems: plan.actionItems,
      reason: plan.reason,
      status: plan.status,
      createdAt: FIX_RESULT_BATCH,
    },
  ];
}
