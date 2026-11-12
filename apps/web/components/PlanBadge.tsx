import type { I18n } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
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
import { getEmailTerminologyMessages } from "@/utils/terminology-messages";
import { sortActionsByPriority } from "@/utils/action-sort";
import { getMessagingProviderName } from "@/utils/messaging/platforms";
import { getIntegrationActionLabelMessage } from "@/utils/mcp/tool-specs-messages";

type PlanAction = ExecutedAction & {
  messagingChannel?: { provider: MessagingProvider } | null;
};

type Plan = Pick<ExecutedRule, "reason" | "status"> & {
  rule: Rule | null;
  actionItems: PlanAction[];
};

export function PlanBadge(props: { plan?: Plan; provider: string }) {
  const { plan, provider } = props;
  const { i18n } = useLingui();

  // if (!plan) return <Badge color="gray">Not planned</Badge>;
  if (!plan) return null;

  if (!plan.rule) {
    const component = (
      <Badge color="yellow">
        <Trans>No plan</Trans>
      </Badge>
    );

    if (plan.reason) {
      return (
        <HoverCard
          className="w-80"
          content={
            <div className="max-w-full whitespace-pre-wrap text-sm">
              <strong>
                <Trans>Reason:</Trans>
              </strong>{" "}
              {plan.reason}
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
                  {getActionMessage(action, provider, i18n)}
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
  i18n: I18n,
  action?: PlanAction,
) {
  const terminology = getEmailTerminologyMessages(provider);

  switch (type) {
    case ActionType.LABEL:
      return i18n._(terminology.label.action);
    case ActionType.ARCHIVE:
      return i18n._(msg`Archive`);
    case ActionType.FORWARD:
      return i18n._(msg`Forward`);
    case ActionType.REPLY:
      return i18n._(msg`Reply`);
    case ActionType.SEND_EMAIL:
      return i18n._(msg`Send`);
    case ActionType.DRAFT_EMAIL:
    case ActionType.DRAFT_MESSAGING_CHANNEL:
      return i18n._(msg`Draft`);
    case ActionType.CALL_WEBHOOK:
      return i18n._(msg`Webhook`);
    case ActionType.MARK_SPAM:
      return i18n._(msg`Mark as spam`);
    case ActionType.MARK_READ:
      return i18n._(msg`Mark as read`);
    case ActionType.STAR:
      return i18n._(msg`Star`);
    case ActionType.NOTIFY_MESSAGING_CHANNEL: {
      if (!action?.messagingChannel?.provider) return i18n._(msg`Notify`);
      const providerName = getMessagingProviderName(
        action.messagingChannel.provider,
      );
      return i18n._(msg`Notify on ${providerName}`);
    }
    case ActionType.NOTIFY_SENDER:
      return i18n._(msg`Notify Sender`);
    case ActionType.INTEGRATION:
      return i18n._(getIntegrationActionLabelMessage(action));
    default:
      return capitalCase(type);
  }
}

function getActionMessage(
  action: PlanAction,
  provider: string,
  i18n: I18n,
): string {
  const terminology = getEmailTerminologyMessages(provider);

  switch (action.type) {
    // biome-ignore lint/suspicious/noFallthroughSwitchClause: ignore
    case ActionType.LABEL:
      if (action.label) {
        const labelTerm = i18n._(terminology.label.singularCapitalized);
        const label = action.label;
        return i18n._(msg`${labelTerm}: "${label}"`);
      }
    case ActionType.REPLY:
    case ActionType.SEND_EMAIL:
    // biome-ignore lint/suspicious/noFallthroughSwitchClause: ignore
    case ActionType.FORWARD:
      if (action.to) {
        const actionLabel = getActionLabel(action.type, provider, i18n, action);
        const to = action.to;
        const summary = i18n._(msg`${actionLabel} to ${to}`);
        return `${summary}${action.content ? `:\n${action.content}` : ""}`;
      }
    default:
      return getActionLabel(action.type, provider, i18n, action);
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
    case ActionType.DELETE:
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
    case ActionType.INTEGRATION:
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
