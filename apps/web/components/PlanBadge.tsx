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
};

// export function PlanBadge(props: { plan?: Thread["plan"] }) {
export function PlanBadge(props: { plan?: Plan }) {
  const { plan } = props;

  if (!plan) return <Badge color="gray">Not planned</Badge>;

  if (!plan.rule) return <Badge color="yellow">No plan</Badge>;

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
      <Badge
        color={getPlanColor(plan)}
        className="max-w-[110px] overflow-hidden"
      >
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

function getPlanColor(plan: Plan | null): Color {
  switch (plan?.rule?.actions?.[0]?.type) {
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
