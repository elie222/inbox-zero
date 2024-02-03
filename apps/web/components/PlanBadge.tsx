import { CheckCircleIcon } from "lucide-react";
import { capitalCase } from "capital-case";
import { Badge, Color } from "@/components/Badge";
import { HoverCard } from "@/components/HoverCard";
import { ActionType } from "@prisma/client";

type Plan = {
  rule?: {
    name: string;
    actions: {
      type: ActionType;
      to?: string | null;
      content?: string | null;
      label?: string | null;
    }[];
  } | null;
  databaseRule?: { instructions: string };
  reason?: string;
  executed?: boolean;
};

export function PlanBadge(props: { plan?: Plan }) {
  const { plan } = props;

  if (!plan) return <Badge color="gray">Not planned</Badge>;

  if (!plan.rule) {
    const component = <Badge color="yellow">No plan</Badge>;

    if (plan.reason) {
      return (
        <HoverCard
          content={
            <div className="max-w-full whitespace-pre-wrap text-sm">
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
      content={
        <div className="text-sm">
          {plan.databaseRule?.instructions ? (
            <div className="max-w-full whitespace-pre-wrap">
              {plan.databaseRule.instructions}
            </div>
          ) : null}
          <div className="mt-4 space-y-2">
            {plan.rule.actions?.map((action, i) => {
              return (
                <div key={i}>
                  <Badge color={getActionColor(action.type)}>
                    {getActionMessage(action.type, plan)}
                  </Badge>
                </div>
              );
            })}
          </div>
        </div>
      }
    >
      <Badge color={getPlanColor(plan, !!plan.executed)}>
        {plan.executed && <CheckCircleIcon className="mr-2 h-3 w-3" />}
        {plan.rule.name}
      </Badge>
    </HoverCard>
  );
}

function getActionMessage(actionType: ActionType, plan: Plan): string {
  switch (actionType) {
    case ActionType.LABEL:
      if (plan.rule?.actions?.[0]?.label)
        return `Label as ${plan.rule.actions[0].label}`;
    case ActionType.REPLY:
    case ActionType.SEND_EMAIL:
    case ActionType.FORWARD:
      if (plan.rule?.actions?.[0]?.to)
        return `${capitalCase(actionType)} to ${plan.rule.actions[0].to}${
          plan.rule?.actions?.[0]?.content
            ? `:\n${plan.rule.actions[0].content}`
            : ""
        }`;
    default:
      return capitalCase(actionType);
  }
}

function getActionColor(actionType: ActionType): Color {
  switch (actionType) {
    case ActionType.REPLY:
    case ActionType.FORWARD:
    case ActionType.SEND_EMAIL:
    case ActionType.DRAFT_EMAIL:
      return "green";
    case ActionType.ARCHIVE:
      return "yellow";
    case ActionType.LABEL:
      return "blue";
    default:
      return "purple";
  }
}

function getPlanColor(plan: Plan | null, executed: boolean): Color {
  if (executed) return "green";

  switch (plan?.rule?.actions?.[0]?.type) {
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
