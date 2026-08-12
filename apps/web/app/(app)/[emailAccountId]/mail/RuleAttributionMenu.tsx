"use client";

import type { ComponentProps } from "react";
import { MoreHorizontalIcon } from "lucide-react";
import { FixWithChat } from "@/app/(app)/[emailAccountId]/assistant/FixWithChat";
import { getRuleResultReasonDisplay } from "@/app/(app)/[emailAccountId]/assistant/ResultDisplay";
import { MailLabelChip } from "@/app/(app)/[emailAccountId]/mail/MailLabelChip";
import type { ThreadPlan } from "@/app/(app)/[emailAccountId]/mail/types";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ActionType, ExecutedRuleStatus } from "@/generated/prisma/enums";
import { getShortcutHint } from "@/lib/shortcuts/registry";
import { ACTION_TYPE_LABELS, getVisibleActions } from "@/utils/action-display";
import type { ParsedMessage } from "@/utils/types";

type FixWithChatResults = ComponentProps<typeof FixWithChat>["results"];

export type RuleAttributionMenuProps = {
  /**
   * Every rule that fired on the thread, newest first. Attribution is
   * rule-scoped, not label-scoped: one entry per rule, each with its own reason,
   * the actions it applied, and its own way to correct it.
   */
  plans: ThreadPlan[];
  /** The message the fix flow reasons about — the thread's latest message. */
  message: ParsedMessage | null;
  /** `setInput` from `useChat()`: the fix flow seeds the assistant with it. */
  setChatInput: (input: string) => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
};

/** The reader's ⋯ menu: why the thread looks the way it does. */
export function RuleAttributionMenu({
  plans,
  message,
  setChatInput,
  open,
  onOpenChange,
}: RuleAttributionMenuProps) {
  if (!plans.length) return null;

  const hint = getShortcutHint("moreActions");

  return (
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
        className="w-[min(24rem,calc(100vw-1rem))]"
      >
        {plans.map((plan) => (
          <RuleAttribution
            key={plan.id}
            message={message}
            plan={plan}
            setChatInput={setChatInput}
          />
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function RuleAttribution({
  plan,
  message,
  setChatInput,
}: {
  plan: ThreadPlan;
  message: ParsedMessage | null;
  setChatInput: (input: string) => void;
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

      {message ? (
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
