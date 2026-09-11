"use client";

import type { ComponentProps } from "react";
import { MoreHorizontalIcon, SparklesIcon } from "lucide-react";
import { FixWithChat } from "@/app/(app)/[emailAccountId]/assistant/FixWithChat";
import { getRuleResultReasonDisplay } from "@/app/(app)/[emailAccountId]/assistant/ResultDisplay";
import { MailLabelChip } from "@/app/(app)/[emailAccountId]/mail/MailLabelChip";
import type { ThreadPlan } from "@/app/(app)/[emailAccountId]/mail/types";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuPortal,
  DropdownMenuSubContent,
} from "@/components/ui/dropdown-menu";
import { ActionType, ExecutedRuleStatus } from "@/generated/prisma/enums";
import { ACTION_TYPE_LABELS, getVisibleActions } from "@/utils/action-display";
import type { ParsedMessage } from "@/utils/types";

type FixWithChatResults = ComponentProps<typeof FixWithChat>["results"];

export function MessageActionsMenu({
  message,
  plans,
  setChatInput,
  showFixWithChat,
}: {
  message: ParsedMessage;
  plans: ThreadPlan[];
  setChatInput: (input: string) => void;
  showFixWithChat: boolean;
}) {
  const messagePlans = plans.filter((plan) => plan.messageId === message.id);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          aria-label="More message actions"
          className="size-7 text-muted-foreground"
          size="icon"
          variant="ghost"
          onClick={(event) => event.stopPropagation()}
        >
          <MoreHorizontalIcon className="size-3.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => event.stopPropagation()}
        onEscapeKeyDown={(event) => event.stopPropagation()}
      >
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <SparklesIcon className="mr-2 size-4" />
            Matched reason
          </DropdownMenuSubTrigger>
          <DropdownMenuPortal>
            <DropdownMenuSubContent
              className="max-h-[var(--radix-dropdown-menu-content-available-height)] w-[min(24rem,calc(100vw-1rem))] overflow-y-auto p-0"
              onClick={(event) => event.stopPropagation()}
              onKeyDown={(event) => event.stopPropagation()}
            >
              {messagePlans.length ? (
                messagePlans.map((plan) => (
                  <RuleAttribution
                    key={plan.id}
                    message={message}
                    plan={plan}
                    setChatInput={setChatInput}
                    showFixWithChat={showFixWithChat}
                  />
                ))
              ) : (
                <p className="p-3 text-muted-foreground text-xs">
                  No matched rules for this message.
                </p>
              )}
            </DropdownMenuSubContent>
          </DropdownMenuPortal>
        </DropdownMenuSub>
      </DropdownMenuContent>
    </DropdownMenu>
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
 * latest execution per message and then drops it. `ResultsDisplay`, inside `FixWithChat`,
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
