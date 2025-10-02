import { capitalCase } from "capital-case";
import { Badge } from "@/components/Badge";
import type { Thread } from "@/components/email-list/types";
import { PlanBadge, getActionColor } from "@/components/PlanBadge";
import { getActionFields } from "@/utils/action-item";

export function PlanExplanation(props: { provider: string; thread: Thread }) {
  const { provider, thread } = props;
  if (!thread) return null;
  const { plan } = thread;
  if (!plan?.rule) return null;

  return (
    <div className="max-h-48 overflow-auto border-b border-b-muted bg-gradient-to-r from-purple-50 via-blue-50 to-green-50 p-4 text-primary">
      <div className="flex">
        <div className="flex-shrink-0">
          <PlanBadge plan={plan} provider={provider} />
        </div>
        <div className="ml-2">{plan.rule?.instructions}</div>
      </div>
      <div className="mt-4 space-y-2">
        {plan.actionItems?.map((action, i) => {
          return (
            <div key={i}>
              <Badge color={getActionColor(action.type)}>
                {capitalCase(action.type)}
              </Badge>

              <div className="mt-1">
                {Object.entries(getActionFields(action)).map(([key, value]) => {
                  return (
                    <div key={key}>
                      <strong>{capitalCase(key)}: </strong>
                      <span className="whitespace-pre-wrap">
                        {value as string}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
