import { CheckCircleIcon } from "lucide-react";
import { capitalCase } from "capital-case";
import { Badge, type Color } from "@/components/Badge";
import { HoverCard } from "@/components/HoverCard";
import {
  ActionType,
  type ExecutedRule,
  type ExecutedAction,
  type Rule,
} from "@prisma/client";
import { truncate } from "@/utils/string";

type Plan = Pick<ExecutedRule, "reason" | "status"> & {
  rule: Rule | null;
  actionItems: ExecutedAction[];
};

export function PlanBadge(props: { plan?: Plan }) {
  const { plan } = props;

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
            {plan.actionItems?.map((action, i) => {
              return (
                <div key={i}>
                  <Badge
                    color={getActionColor(action.type)}
                    className="whitespace-pre-wrap"
                  >
                    {getActionMessage(action)}
                  </Badge>
                </div>
              );
            })}
          </div>
        </div>
      }
    >
      <Badge color={getPlanColor(plan, plan.status === "APPLIED")}>
        {plan.status === "APPLIED" && (
          <CheckCircleIcon className="mr-2 h-3 w-3" />
        )}
        {plan.rule.name}
      </Badge>
    </HoverCard>
  );
}

export function ActionBadge({ type }: { type: ActionType }) {
  return <Badge color={getActionColor(type)}>{getActionLabel(type)}</Badge>;
}

export function ActionBadgeExpanded({ action }: { action: ExecutedAction }) {
  switch (action.type) {
    case ActionType.ARCHIVE:
      return <ActionBadge type={ActionType.ARCHIVE} />;
    case ActionType.LABEL:
      return <Badge color="blue">Label: "{action.label}"</Badge>;
    case ActionType.REPLY:
      return (
        <div>
          <Badge color="indigo">Reply</Badge>
          <ActionContent action={action} />
        </div>
      );
    case ActionType.SEND_EMAIL:
      return (
        <div>
          <Badge color="indigo">Send email</Badge>
          <ActionContent action={action} />
        </div>
      );
    case ActionType.FORWARD:
      return (
        <div>
          <Badge color="indigo">Forward email</Badge>
          <ActionContent action={action} />
        </div>
      );
    case ActionType.DRAFT_EMAIL:
      return (
        <div>
          <Badge color="pink">Draft reply</Badge>
          <ActionContent action={action} />
        </div>
      );
    case ActionType.MARK_SPAM:
      return <ActionBadge type={ActionType.MARK_SPAM} />;
    case ActionType.CALL_WEBHOOK:
      return <ActionBadge type={ActionType.CALL_WEBHOOK} />;
    case ActionType.MARK_READ:
      return <ActionBadge type={ActionType.MARK_READ} />;
    default:
      return <ActionBadge type={action.type} />;
  }
}

function ActionContent({ action }: { action: ExecutedAction }) {
  return (
    !!action.content && (
      <div className="mt-1">{truncate(action.content, 280)}</div>
    )
  );
}

function getActionLabel(type: ActionType) {
  switch (type) {
    case ActionType.LABEL:
      return "Label";
    case ActionType.ARCHIVE:
      return "Archive";
    case ActionType.FORWARD:
      return "Forward";
    case ActionType.REPLY:
      return "Reply";
    case ActionType.SEND_EMAIL:
      return "Send";
    case ActionType.DRAFT_EMAIL:
      return "Draft";
    case ActionType.CALL_WEBHOOK:
      return "Webhook";
    case ActionType.MARK_SPAM:
      return "Mark as spam";
    case ActionType.MARK_READ:
      return "Mark as read";
    default:
      return capitalCase(type);
  }
}

function getActionMessage(action: ExecutedAction): string {
  switch (action.type) {
    // biome-ignore lint/suspicious/noFallthroughSwitchClause: ignore
    case ActionType.LABEL:
      if (action.label) return `Label: "${action.label}"`;
    case ActionType.REPLY:
    case ActionType.SEND_EMAIL:
    // biome-ignore lint/suspicious/noFallthroughSwitchClause: ignore
    case ActionType.FORWARD:
      if (action.to)
        return `${getActionLabel(action.type)} to ${action.to}${
          action.content ? `:\n${action.content}` : ""
        }`;
    default:
      return getActionLabel(action.type);
  }
}

export function getActionColor(actionType: ActionType): Color {
  switch (actionType) {
    case ActionType.REPLY:
    case ActionType.FORWARD:
    case ActionType.SEND_EMAIL:
    case ActionType.DRAFT_EMAIL:
      return "green";
    case ActionType.ARCHIVE:
    case ActionType.MARK_READ:
      return "yellow";
    case ActionType.LABEL:
      return "blue";
    default:
      return "purple";
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
      return "blue";
    case ActionType.ARCHIVE:
      return "yellow";
    case ActionType.LABEL:
      return "purple";
    default:
      return "indigo";
  }
}
