import { BotIcon, FilterIcon } from "lucide-react";
import type { CreateRuleBody } from "@/utils/actions/rule.validation";
import { ConditionType } from "@/utils/config";
import { CardBasic } from "@/components/ui/card";

export function ConditionSummaryCard({
  condition,
}: {
  condition: CreateRuleBody["conditions"][number];
}) {
  let summaryContent: React.ReactNode = condition.type;
  let Icon = FilterIcon;
  let textColorClass = "text-gray-500";

  switch (condition.type) {
    case ConditionType.AI: {
      Icon = BotIcon;
      textColorClass = "text-purple-500";
      summaryContent = condition.instructions || "No instructions set";
      break;
    }

    case ConditionType.STATIC: {
      textColorClass = "text-blue-500";
      const parts: string[] = [];

      if (condition.from) {
        parts.push(`From: ${condition.from}`);
      }
      if (condition.to) {
        parts.push(`To: ${condition.to}`);
      }
      if (condition.subject) {
        parts.push(`Subject: ${condition.subject}`);
      }

      if (parts.length > 0) {
        summaryContent = (
          <>
            <span>Static Condition</span>
            <div className="mt-2 space-y-1">
              {parts.map((part, index) => (
                <div key={index} className="text-muted-foreground">
                  {part}
                </div>
              ))}
            </div>
          </>
        );
      } else {
        summaryContent = "Static Condition (no filters set)";
      }
      break;
    }

    default:
      summaryContent = `${condition.type} Condition`;
  }

  return (
    <CardBasic className="flex items-center justify-between p-4">
      <div className="flex items-center gap-3">
        <Icon className={`size-5 ${textColorClass} flex-shrink-0`} />
        <div className="whitespace-pre-wrap">{summaryContent}</div>
      </div>
    </CardBasic>
  );
}
