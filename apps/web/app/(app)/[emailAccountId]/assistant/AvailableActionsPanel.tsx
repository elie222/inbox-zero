import { ActionType } from "@prisma/client";
import { Card, CardContent } from "@/components/ui/card";
import { getActionIcon } from "@/utils/action-display";
import { SectionHeader } from "@/components/Typography";
import { useAccount } from "@/providers/EmailAccountProvider";
import {
  getAvailableActions,
  getExtraActions,
} from "@/utils/ai/rule/create-rule-schema";

const actionNames: Record<ActionType, string> = {
  [ActionType.LABEL]: "Label",
  [ActionType.MOVE_FOLDER]: "Move to folder",
  [ActionType.ARCHIVE]: "Archive",
  [ActionType.DRAFT_EMAIL]: "Draft replies",
  [ActionType.REPLY]: "Send replies",
  [ActionType.FORWARD]: "Forward",
  [ActionType.MARK_READ]: "Mark as read",
  [ActionType.MARK_SPAM]: "Mark as spam",
  [ActionType.SEND_EMAIL]: "Send email",
  [ActionType.CALL_WEBHOOK]: "Call webhook",
  [ActionType.DIGEST]: "Add to digest",
  [ActionType.TRACK_THREAD]: "Track thread",
};

export function AvailableActionsPanel() {
  const { provider } = useAccount();
  return (
    <Card className="h-fit bg-slate-50 dark:bg-slate-900">
      <CardContent className="pt-4">
        <div className="grid gap-2">
          <ActionSection
            actions={getAvailableActions(provider)}
            title="Available Actions"
          />
          <ActionSection actions={getExtraActions()} title="Extra" />
        </div>
      </CardContent>
    </Card>
  );
}

function ActionSection({
  title,
  actions,
}: {
  title: string;
  actions: ActionType[];
}) {
  return (
    <div>
      <SectionHeader>{title}</SectionHeader>
      <div className="grid gap-2 mt-1">
        {actions.map((actionType) => {
          const Icon = getActionIcon(actionType);
          return (
            <div key={actionType} className="flex items-center gap-2">
              <Icon className="size-3.5 text-muted-foreground" />
              <span className="text-sm">{actionNames[actionType]}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
