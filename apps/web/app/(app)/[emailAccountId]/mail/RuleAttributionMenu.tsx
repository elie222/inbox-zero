"use client";

import type { ComponentProps } from "react";
import { MoreHorizontalIcon } from "lucide-react";
import { FixWithChat } from "@/app/(app)/[emailAccountId]/assistant/FixWithChat";
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

      <DropdownMenuContent align="end" className="w-80">
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

  return (
    <div className="border-border border-b px-2 py-2.5 last:border-b-0">
      <div className="text-muted-foreground text-xs">
        {plan.status === ExecutedRuleStatus.APPLIED ? "Applied by" : "Matched"}{" "}
        <span className="font-medium text-foreground">
          {plan.rule?.name ?? "a deleted rule"}
        </span>
      </div>

      {plan.reason ? (
        <p className="mt-1.5 text-foreground text-xs leading-relaxed">
          {plan.reason}
        </p>
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
