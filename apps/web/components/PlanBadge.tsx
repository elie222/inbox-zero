import { CheckCircleIcon } from "lucide-react";
import { capitalCase } from "capital-case";
import { Badge, Color } from "@/components/Badge";
import { HoverCard } from "@/components/HoverCard";
import { ActionType, ExecutedRule, ExecutedAction, Rule } from "@prisma/client";

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

function getActionMessage(action: ExecutedAction): string {
  switch (action.type) {
    case ActionType.LABEL:
      if (action.label) return `Label as ${action.label}`;
    case ActionType.REPLY:
    case ActionType.SEND_EMAIL:
    case ActionType.FORWARD:
      if (action.to)
        return `${capitalCase(action.type)} to ${action.to}${
          action.content ? `:\n${action.content}` : ""
        }`;
    default:
      return capitalCase(action.type);
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
