import { Badge } from "@/components/Badge";
import { getActionColor } from "@/components/PlanBadge";
import type { ActionType } from "@/generated/prisma/enums";
import {
  getActionDisplay,
  getActionIcon,
  getVisibleActions,
} from "@/utils/action-display";

export function RuleActions({
  actions,
  provider,
  labels,
  showDetails = true,
}: {
  actions: {
    id: string;
    type: ActionType;
    label?: string | null;
    labelId?: string | null;
    folderName?: string | null;
    content?: string | null;
    to?: string | null;
    subject?: string | null;
    cc?: string | null;
    bcc?: string | null;
    url?: string | null;
  }[];
  provider: string;
  labels: Array<{ id: string; name: string }>;
  showDetails?: boolean;
}) {
  return (
    <div className="flex flex-col gap-2 flex-wrap">
      {getVisibleActions(actions).map((action) => {
        const Icon = getActionIcon(action.type);
        const fields = [
          { key: "to", value: action.to },
          { key: "cc", value: action.cc },
          { key: "bcc", value: action.bcc },
          { key: "subject", value: action.subject },
          { key: "content", value: action.content },
          { key: "url", value: action.url },
        ].filter((field) => field.value);

        return (
          <div key={action.id} className="flex flex-col gap-1">
            <Badge
              color={getActionColor(action.type)}
              className="w-fit max-w-full whitespace-normal break-words"
            >
              <Icon className="size-3 shrink-0 mr-1.5" />
              {getActionDisplay(action, provider, labels)}
            </Badge>
            {showDetails && fields.length > 0 && (
              <div className="ml-1 space-y-0.5 text-sm text-muted-foreground">
                {fields.map((field) => (
                  <div
                    key={field.key}
                    className="whitespace-pre-wrap break-all"
                  >
                    <span className="font-medium capitalize">{field.key}:</span>{" "}
                    {field.value}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
