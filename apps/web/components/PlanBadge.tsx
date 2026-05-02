import { CheckCircleIcon } from "lucide-react";
import { capitalCase } from "capital-case";
import { Badge, type Color } from "@/components/Badge";
import { HoverCard } from "@/components/HoverCard";
import {
  ActionType,
  ExecutedRuleStatus,
  type MessagingProvider,
} from "@/generated/prisma/enums";
import type {
  ExecutedRule,
  ExecutedAction,
  Rule,
} from "@/generated/prisma/client";
import { getEmailTerminology } from "@/utils/terminology";
import { sortActionsByPriority } from "@/utils/action-sort";
import { getMessagingProviderName } from "@/utils/messaging/platforms";

type PlanAction = ExecutedAction & {
  messagingChannel?: { provider: MessagingProvider } | null;
};

type Plan = Pick<ExecutedRule, "reason" | "status"> & {
  rule: Rule | null;
  actionItems: PlanAction[];
};

export function PlanBadge(props: { plan?: Plan; provider: string }) {
  const { plan, provider } = props;

  // if (!plan) return <Badge color="gray">Not planned</Badge>;
  if (!plan) return null;

  if (!plan.rule) {
    const component = <Badge color="yellow">No plan</Badge>;

    if (plan.reason) {
      return (
        <HoverCard
          className="w-80"
          content={
            <div className="max-w-full whitespace-pre-wrap text-sm">
              <strong>Reason:</strong> {plan.reason}
            </div>
          }
        >
          {component}
        </HoverCard>
      );
    }
    return component;
  }

  return (
    <HoverCard
      className="w-80"
      content={
        <div className="text-sm">
          {plan.rule?.instructions ? (
            <div className="max-w-full whitespace-pre-wrap">
              {plan.rule.instructions}
            </div>
          ) : null}
          <div className="mt-4 space-y-2">
            {sortActionsByPriority(plan.actionItems || []).map((action, i) => (
              <div key={i}>
                <Badge
                  color={getActionColor(action.type)}
                  className="whitespace-pre-wrap"
                >
                  {getActionMessage(action, provider)}
                </Badge>
              </div>
            ))}
          </div>
        </div>
      }
    >
      <Badge
        color={getPlanColor(plan, plan.status === ExecutedRuleStatus.APPLIED)}
      >
        {plan.status === ExecutedRuleStatus.APPLIED && (
          <CheckCircleIcon className="mr-2 h-3 w-3" />
        )}
        {plan.rule.name}
      </Badge>
    </HoverCard>
  );
}

function getActionLabel(
  type: ActionType,
  provider: string,
  action?: PlanAction,
) {
  const terminology = getEmailTerminology(provider);

  switch (type) {
    case ActionType.LABEL:
      return terminology.label.action;
    case ActionType.ARCHIVE:
      return "Archive";
    case ActionType.FORWARD:
      return "Forward";
    case ActionType.REPLY:
      return "Reply";
    case ActionType.SEND_EMAIL:
      return "Send";
    case ActionType.DRAFT_EMAIL:
    case ActionType.DRAFT_MESSAGING_CHANNEL:
      return "Draft";
    case ActionType.CALL_WEBHOOK:
      return "Webhook";
    case ActionType.MARK_SPAM:
      return "Mark as spam";
    case ActionType.MARK_READ:
      return "Mark as read";
    case ActionType.STAR:
      return "Star";
    case ActionType.NOTIFY_MESSAGING_CHANNEL:
      return action?.messagingChannel?.provider
        ? `Notify via ${getMessagingProviderName(action.messagingChannel.provider)}`
        : "Notify";
    case ActionType.NOTIFY_SENDER:
      return "Notify Sender";
    default:
      return capitalCase(type);
  }
}

function getActionMessage(action: PlanAction, provider: string): string {
  const terminology = getEmailTerminology(provider);

  switch (action.type) {
    // biome-ignore lint/suspicious/noFallthroughSwitchClause: ignore
    case ActionType.LABEL:
      if (action.label)
        return `${terminology.label.singularCapitalized}: "${action.label}"`;
    case ActionType.REPLY:
    case ActionType.SEND_EMAIL:
    // biome-ignore lint/suspicious/noFallthroughSwitchClause: ignore
    case ActionType.FORWARD:
      if (action.to)
        return `${getActionLabel(action.type, provider, action)} to ${action.to}${
          action.content ? `:\n${action.content}` : ""
        }`;
    default:
      return getActionLabel(action.type, provider, action);
  }
}

export function getActionColor(actionType: ActionType): Color {
  switch (actionType) {
    case ActionType.REPLY:
    case ActionType.FORWARD:
    case ActionType.SEND_EMAIL:
    case ActionType.DRAFT_EMAIL:
    case ActionType.DRAFT_MESSAGING_CHANNEL:
      return "green";
    case ActionType.ARCHIVE:
    case ActionType.MARK_READ:
    case ActionType.STAR:
      return "yellow";
    case ActionType.LABEL:
      return "blue";
    case ActionType.MOVE_FOLDER:
      return "pink";
    case ActionType.MARK_SPAM:
      return "red";
    case ActionType.CALL_WEBHOOK:
    case ActionType.DIGEST:
      return "purple";
    case ActionType.NOTIFY_MESSAGING_CHANNEL:
    case ActionType.NOTIFY_SENDER:
      return "purple";
    default: {
      const exhaustiveCheck: never = actionType;
      return exhaustiveCheck;
    }
  }
}

function getPlanColor(plan: Plan | null, executed: boolean): Color {
  if (executed) return "green";

  const firstAction = plan?.actionItems?.[0];

  switch (firstAction?.type) {
    case ActionType.REPLY:
    case ActionType.FORWARD:
    case ActionType.SEND_EMAIL:
    case ActionType.DRAFT_EMAIL:
    case ActionType.DRAFT_MESSAGING_CHANNEL:
      return "blue";
    case ActionType.ARCHIVE:
    case ActionType.STAR:
      return "yellow";
    case ActionType.LABEL:
      return "purple";
    default:
      return "indigo";
  }
}
